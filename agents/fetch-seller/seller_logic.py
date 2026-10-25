"""Pure, dependency-free seller decision logic for the Fetch.ai agent.

The hosted agent intentionally performs bounded deterministic work. It receives
only the sanitized seller projection produced by Convex, finds catalog entries
that satisfy the requested hard requirements, and proposes the public reference
price. Convex remains authoritative for floors, costs, inventory, policy
versions, and all buyer-visible totals.
"""

from __future__ import annotations

import math
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple


MAX_ID_LENGTH = 128
MAX_TEXT_LENGTH = 2_000
MAX_LINES = 3
MAX_CATALOG_ENTRIES = 500
MAX_REQUIREMENTS_PER_LINE = 40
MAX_QUANTITY = 10
MAX_INPUT_BYTES = 1_000_000
MAX_SCHEMA_DEPTH = 40

FORBIDDEN_INPUT_KEYS = {
    "privateMaximumCents",
    "rawMessages",
    "origins",
    "ownerId",
    "operatorFloorCents",
    "unitCostByListing",
    "minimumContributionByListing",
    "privatePriceRationale",
    "buyerCeilingCents",
    "competitorCosts",
}

ID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")

# Units match the seller validation contract. Values are normalized into a
# family base unit before a numeric comparison.
NUMERIC_UNITS: Dict[str, Tuple[str, float]] = {
    "GB": ("storage", 1.0),
    "TB": ("storage", 1024.0),
    "g": ("mass", 1.0),
    "kg": ("mass", 1000.0),
    "mm": ("length", 1.0),
    "cm": ("length", 10.0),
    "m": ("length", 1000.0),
    "ml": ("volume", 0.001),
    "L": ("volume", 1.0),
    "V": ("voltage", 1.0),
    "Hz": ("frequency", 1.0),
    "%": ("percentage", 1.0),
}


class SellerInputError(ValueError):
    """Raised when an inbound provider envelope is outside the contract."""


@lru_cache(maxsize=1)
def _generated_schema() -> Mapping[str, Any]:
    schema_path = Path(__file__).with_name("seller.schema.json")
    try:
        value = json.loads(schema_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SellerInputError("generated seller schema is unavailable") from error
    if not isinstance(value, dict) or not isinstance(value.get("$defs"), dict):
        raise SellerInputError("generated seller schema is invalid")
    return value


def _schema_ref(root: Mapping[str, Any], reference: str) -> Mapping[str, Any]:
    if not reference.startswith("#/$defs/"):
        raise SellerInputError("unsupported schema reference")
    name = reference.removeprefix("#/$defs/")
    schema = root.get("$defs", {}).get(name)
    if not isinstance(schema, dict):
        raise SellerInputError("generated schema reference is missing")
    return schema


def _schema_type_matches(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, Mapping)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return False


def _validate_generated_schema(value: Any, schema: Mapping[str, Any], label: str, depth: int = 0, root: Optional[Mapping[str, Any]] = None) -> None:
    if depth > MAX_SCHEMA_DEPTH:
        raise SellerInputError(f"{label} exceeds schema nesting limit")
    root = root or schema
    if "$ref" in schema:
        reference = schema.get("$ref")
        if not isinstance(reference, str):
            raise SellerInputError(f"{label} has an invalid schema reference")
        _validate_generated_schema(value, _schema_ref(root, reference), label, depth + 1, root)
        return
    for branch_key in ("oneOf", "anyOf"):
        branches = schema.get(branch_key)
        if branches is not None:
            if not isinstance(branches, list) or not branches:
                raise SellerInputError(f"{label} has an invalid schema branch")
            successes = 0
            for branch in branches:
                if not isinstance(branch, dict):
                    continue
                try:
                    _validate_generated_schema(value, branch, label, depth + 1, root)
                    successes += 1
                except SellerInputError:
                    pass
            if successes == 0:
                raise SellerInputError(f"{label} does not match the generated contract")
            if branch_key == "oneOf" and successes != 1:
                raise SellerInputError(f"{label} matches multiple generated contract branches")
            return
    if "const" in schema and value != schema["const"]:
        raise SellerInputError(f"{label} does not match the required constant")
    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        raise SellerInputError(f"{label} is outside the generated enum")
    expected_type = schema.get("type")
    if isinstance(expected_type, list):
        if not any(_schema_type_matches(value, item) for item in expected_type if isinstance(item, str)):
            raise SellerInputError(f"{label} has the wrong type")
    elif isinstance(expected_type, str) and not _schema_type_matches(value, expected_type):
        raise SellerInputError(f"{label} has the wrong type")
    if isinstance(value, str):
        if isinstance(schema.get("minLength"), int) and len(value) < schema["minLength"]:
            raise SellerInputError(f"{label} is too short")
        if isinstance(schema.get("maxLength"), int) and len(value) > schema["maxLength"]:
            raise SellerInputError(f"{label} is too long")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(schema.get("minimum"), (int, float)) and value < schema["minimum"]:
            raise SellerInputError(f"{label} is below the minimum")
        if isinstance(schema.get("maximum"), (int, float)) and value > schema["maximum"]:
            raise SellerInputError(f"{label} is above the maximum")
    if isinstance(value, list):
        if isinstance(schema.get("minItems"), int) and len(value) < schema["minItems"]:
            raise SellerInputError(f"{label} has too few items")
        if isinstance(schema.get("maxItems"), int) and len(value) > schema["maxItems"]:
            raise SellerInputError(f"{label} has too many items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, child in enumerate(value):
                _validate_generated_schema(child, item_schema, f"{label}[{index}]", depth + 1, root)
    if isinstance(value, Mapping):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        if not isinstance(properties, dict) or not isinstance(required, list):
            raise SellerInputError(f"{label} has an invalid object schema")
        for key in required:
            if not isinstance(key, str) or key not in value:
                raise SellerInputError(f"{label} is missing a required field")
        additional = schema.get("additionalProperties")
        if additional is False:
            unknown = set(value) - set(properties)
            if unknown:
                raise SellerInputError(f"{label} has unknown fields")
        for key, child in value.items():
            child_schema = properties.get(key)
            if isinstance(child_schema, dict):
                _validate_generated_schema(child, child_schema, f"{label}.{key}", depth + 1, root)
            elif isinstance(additional, dict):
                _validate_generated_schema(child, additional, f"{label}.{key}", depth + 1, root)


def validate_v2_input(value: Any, role: str) -> Mapping[str, Any]:
    try:
        encoded = json.dumps(value, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise SellerInputError("v2 input is not JSON-safe") from error
    if len(encoded) > MAX_INPUT_BYTES:
        raise SellerInputError("v2 input is too large")
    reject_private_fields(value)
    root = _mapping(value, "v2 input")
    schema_name = "SellerFinalJobInput" if role == "seller_final" else "CouncilJobInput"
    schema = _schema_ref(_generated_schema(), f"#/$defs/{schema_name}")
    _validate_generated_schema(root, schema, "v2 input", root=_generated_schema())
    bounded_id(root["jobId"], "v2 input.jobId")
    bounded_id(root["runId"], "v2 input.runId")
    if root.get("merchantId") is None:
        raise SellerInputError("seller v2 input must be assigned to a merchant")
    bounded_id(root["merchantId"], "v2 input.merchantId")
    if role in ("seller_advocacy", "seller_reply"):
        if root.get("role") != role or root.get("phase") != ("advocacy" if role == "seller_advocacy" else "reply"):
            raise SellerInputError("council role does not match the seller input")
    if role == "seller_final" and root.get("schemaVersion") != 2:
        raise SellerInputError("final seller input must use schema version 2")
    return root


def validate_v2_output(value: Any, role: str) -> Mapping[str, Any]:
    root = _mapping(value, "v2 output")
    schema_name = {"seller_advocacy": "SellerAdvocacy", "seller_reply": "SellerReply", "seller_final": "SellerFinalDecision"}.get(role)
    if schema_name is None:
        raise SellerInputError("unsupported v2 seller role")
    schema_root = _generated_schema()
    _validate_generated_schema(root, _schema_ref(schema_root, f"#/$defs/{schema_name}"), "v2 output", root=schema_root)
    return root


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise SellerInputError(f"{label} must be an object")
    return value


def _bounded_text(value: Any, label: str, maximum: int = MAX_TEXT_LENGTH) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise SellerInputError(f"{label} is not a bounded string")
    return value


def bounded_id(value: Any, label: str = "id") -> str:
    result = _bounded_text(value, label, MAX_ID_LENGTH)
    if result[0] not in ID_CHARS or any(character not in ID_CHARS for character in result):
        raise SellerInputError(f"{label} contains unsupported characters")
    return result


def _safe_integer(value: Any, label: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise SellerInputError(f"{label} must be an integer >= {minimum}")
    return value


def _finite_scalar(value: Any, label: str) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise SellerInputError(f"{label} must be finite")


def reject_private_fields(value: Any) -> None:
    """Fail closed if a private seller or buyer field is nested anywhere."""

    def visit(node: Any, path: str) -> None:
        if isinstance(node, Mapping):
            for key, child in node.items():
                if key in FORBIDDEN_INPUT_KEYS:
                    raise SellerInputError(f"private field is forbidden: {key}")
                visit(child, f"{path}.{key}")
        elif isinstance(node, list):
            if len(node) > MAX_CATALOG_ENTRIES:
                raise SellerInputError(f"{path} is too large")
            for index, child in enumerate(node):
                visit(child, f"{path}[{index}]")

    visit(value, "$")


def _require_keys(value: Mapping[str, Any], expected: Iterable[str], label: str) -> None:
    expected_set = set(expected)
    actual = set(value.keys())
    if actual != expected_set:
        missing = expected_set - actual
        extra = actual - expected_set
        details = []
        if missing:
            details.append(f"missing={sorted(missing)}")
        if extra:
            details.append(f"extra={sorted(extra)}")
        raise SellerInputError(f"{label} has an invalid shape ({', '.join(details)})")


def _ref(value: Any, label: str) -> Mapping[str, Any]:
    record = _mapping(value, label)
    _require_keys(record, ("id", "version"), label)
    bounded_id(record["id"], f"{label}.id")
    _safe_integer(record["version"], f"{label}.version", 1)
    return record


def validate_provider_input(value: Any) -> Mapping[str, Any]:
    """Validate the public seller projection before any catalog reasoning."""

    try:
        encoded_input = json.dumps(value, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise SellerInputError("input is not JSON-safe") from error
    if len(encoded_input) > MAX_INPUT_BYTES:
        raise SellerInputError("input is too large")
    reject_private_fields(value)
    root = _mapping(value, "input")
    _require_keys(root, ("schemaVersion", "job", "merchant", "brief", "catalog", "policy"), "input")
    if root["schemaVersion"] != 1:
        raise SellerInputError("unsupported input schema version")

    job = _mapping(root["job"], "input.job")
    _require_keys(job, ("jobId", "runId", "phaseId", "role", "merchantId", "candidateIds"), "input.job")
    for field in ("jobId", "runId", "phaseId", "merchantId"):
        bounded_id(job[field], f"input.job.{field}")
    if job["role"] not in ("seller_initial", "seller_response", "seller_final"):
        raise SellerInputError("unsupported seller role")
    candidates = job["candidateIds"]
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 2:
        raise SellerInputError("input.job.candidateIds must contain one or two candidates")
    for index, candidate in enumerate(candidates):
        bounded_id(candidate, f"input.job.candidateIds[{index}]")

    merchant = _mapping(root["merchant"], "input.merchant")
    _require_keys(merchant, ("merchantId", "displayName"), "input.merchant")
    bounded_id(merchant["merchantId"], "input.merchant.merchantId")
    _bounded_text(merchant["displayName"], "input.merchant.displayName", 500)
    if merchant["merchantId"] != job["merchantId"]:
        raise SellerInputError("merchant scope does not match job scope")

    brief = _mapping(root["brief"], "input.brief")
    _require_keys(
        brief,
        ("schemaVersion", "request", "runId", "currency", "deliveryRegion", "deliveryDeadline", "lines", "sharedTarget"),
        "input.brief",
    )
    if brief["schemaVersion"] != 1 or brief["currency"] != "USD" or brief["deliveryRegion"] != "US-CA-SAN_FRANCISCO":
        raise SellerInputError("unsupported seller brief")
    _ref(brief["request"], "input.brief.request")
    bounded_id(brief["runId"], "input.brief.runId")
    _safe_integer(brief["deliveryDeadline"], "input.brief.deliveryDeadline", 1)
    lines = brief["lines"]
    if not isinstance(lines, list) or not 1 <= len(lines) <= MAX_LINES:
        raise SellerInputError("input.brief.lines must contain one to three lines")
    for index, line in enumerate(lines):
        _validate_line(line, f"input.brief.lines[{index}]")
    if brief["runId"] != job["runId"]:
        raise SellerInputError("brief run ID does not match job run ID")

    catalog = root["catalog"]
    if not isinstance(catalog, list) or len(catalog) > MAX_CATALOG_ENTRIES:
        raise SellerInputError("input.catalog is invalid or too large")
    for index, snapshot in enumerate(catalog):
        _validate_snapshot(snapshot, f"input.catalog[{index}]")

    policy = root["policy"]
    if policy is not None:
        _validate_public_policy(policy, "input.policy")
        if policy["merchantId"] != job["merchantId"]:
            raise SellerInputError("policy merchant scope does not match job scope")
    for index, snapshot in enumerate(catalog):
        if snapshot["listing"]["merchantId"] != job["merchantId"]:
            raise SellerInputError(f"input.catalog[{index}] is outside the job merchant scope")
    return root


def _validate_line(value: Any, label: str) -> None:
    line = _mapping(value, label)
    expected = ("lineId", "role", "category", "profile", "quantity", "allowedConditions", "requirements", "useCaseSummary")
    _require_keys(line, expected, label)
    bounded_id(line["lineId"], f"{label}.lineId")
    if line["role"] not in ("primary", "related"):
        raise SellerInputError(f"{label}.role is invalid")
    if line["category"] not in ("laptop", "tech_accessory", "clothing", "household_accessory", "small_appliance"):
        raise SellerInputError(f"{label}.category is invalid")
    _ref(line["profile"], f"{label}.profile")
    quantity = _safe_integer(line["quantity"], f"{label}.quantity", 1)
    if quantity > MAX_QUANTITY:
        raise SellerInputError(f"{label}.quantity is too large")
    conditions = line["allowedConditions"]
    if not isinstance(conditions, list) or not conditions or any(condition not in ("new", "refurbished") for condition in conditions):
        raise SellerInputError(f"{label}.allowedConditions is invalid")
    requirements = line["requirements"]
    if not isinstance(requirements, list) or len(requirements) > MAX_REQUIREMENTS_PER_LINE:
        raise SellerInputError(f"{label}.requirements is invalid")
    for index, requirement in enumerate(requirements):
        _validate_requirement(requirement, f"{label}.requirements[{index}]")
    _bounded_text(line["useCaseSummary"], f"{label}.useCaseSummary", 500)


def _validate_requirement(value: Any, label: str) -> None:
    requirement = _mapping(value, label)
    _require_keys(requirement, ("id", "fieldId", "operator", "value", "unit", "strength", "weight"), label)
    bounded_id(requirement["id"], f"{label}.id")
    _bounded_text(requirement["fieldId"], f"{label}.fieldId", 100)
    if requirement["operator"] not in ("equals", "in", "min", "max", "containsAll"):
        raise SellerInputError(f"{label}.operator is invalid")
    if not isinstance(requirement["value"], (str, int, float, bool, list)) or isinstance(requirement["value"], dict):
        raise SellerInputError(f"{label}.value is invalid")
    _finite_scalar(requirement["value"], f"{label}.value")
    if isinstance(requirement["value"], list) and (len(requirement["value"]) > 40 or any(not isinstance(item, str) for item in requirement["value"])):
        raise SellerInputError(f"{label}.value is invalid")
    if requirement["unit"] is not None:
        _bounded_text(requirement["unit"], f"{label}.unit", 40)
    if requirement["strength"] not in ("hard", "soft") or requirement["weight"] not in (1, 2):
        raise SellerInputError(f"{label}.strength or weight is invalid")


def _validate_snapshot(value: Any, label: str) -> None:
    snapshot = _mapping(value, label)
    _require_keys(snapshot, ("variant", "listing", "availableQuantity"), label)
    variant = _mapping(snapshot["variant"], f"{label}.variant")
    _require_keys(variant, ("id", "productId", "title", "category", "profile", "manufacturerPartNumber", "attributes", "syntheticProduct"), f"{label}.variant")
    bounded_id(variant["id"], f"{label}.variant.id")
    bounded_id(variant["productId"], f"{label}.variant.productId")
    _bounded_text(variant["title"], f"{label}.variant.title", 500)
    if variant["category"] not in ("laptop", "tech_accessory", "clothing", "household_accessory", "small_appliance"):
        raise SellerInputError(f"{label}.variant.category is invalid")
    _ref(variant["profile"], f"{label}.variant.profile")
    if variant["manufacturerPartNumber"] is not None:
        _bounded_text(variant["manufacturerPartNumber"], f"{label}.variant.manufacturerPartNumber", 200)
    if not isinstance(variant["attributes"], Mapping) or len(variant["attributes"]) > 100:
        raise SellerInputError(f"{label}.variant.attributes is invalid")
    for field_id, attribute in variant["attributes"].items():
        _bounded_text(field_id, f"{label}.variant.attributes.field", 100)
        _validate_attribute(attribute, f"{label}.variant.attributes.{field_id}")
    if not isinstance(variant["syntheticProduct"], bool):
        raise SellerInputError(f"{label}.variant.syntheticProduct is invalid")

    listing = _mapping(snapshot["listing"], f"{label}.listing")
    _require_keys(listing, ("listing", "merchantId", "variantId", "condition", "unitId", "initialQuantity", "referenceUnitCents", "diagnosticAttributes"), f"{label}.listing")
    _ref(listing["listing"], f"{label}.listing.listing")
    bounded_id(listing["merchantId"], f"{label}.listing.merchantId")
    bounded_id(listing["variantId"], f"{label}.listing.variantId")
    if listing["condition"] not in ("new", "refurbished"):
        raise SellerInputError(f"{label}.listing.condition is invalid")
    if listing["unitId"] is not None:
        bounded_id(listing["unitId"], f"{label}.listing.unitId")
    _safe_integer(listing["initialQuantity"], f"{label}.listing.initialQuantity", 0)
    _safe_integer(listing["referenceUnitCents"], f"{label}.listing.referenceUnitCents", 0)
    if not isinstance(listing["diagnosticAttributes"], Mapping):
        raise SellerInputError(f"{label}.listing.diagnosticAttributes is invalid")
    _safe_integer(snapshot["availableQuantity"], f"{label}.availableQuantity", 0)
    if listing["variantId"] != variant["id"]:
        raise SellerInputError(f"{label} variant/listing IDs do not match")


def _validate_attribute(value: Any, label: str) -> None:
    attribute = _mapping(value, label)
    _require_keys(attribute, ("value", "unit", "provenance", "sourceId"), label)
    attribute_value = attribute["value"]
    if attribute_value is not None and not isinstance(attribute_value, (str, int, float, bool, list)):
        raise SellerInputError(f"{label}.value is invalid")
    if attribute_value is not None:
        _finite_scalar(attribute_value, f"{label}.value")
    if isinstance(attribute_value, list) and (len(attribute_value) > 40 or any(not isinstance(item, str) for item in attribute_value)):
        raise SellerInputError(f"{label}.value is invalid")
    if attribute["unit"] is not None:
        _bounded_text(attribute["unit"], f"{label}.unit", 40)
    if attribute["provenance"] not in ("manufacturer", "real_report", "synthetic_demo"):
        raise SellerInputError(f"{label}.provenance is invalid")
    if attribute["sourceId"] is not None:
        bounded_id(attribute["sourceId"], f"{label}.sourceId")


def _validate_public_policy(value: Any, label: str) -> None:
    policy = _mapping(value, label)
    _require_keys(policy, ("policy", "merchantId", "enabled", "shippingCents", "arrivalCalendarDays", "warrantyMonths", "returnDays"), label)
    _ref(policy["policy"], f"{label}.policy")
    bounded_id(policy["merchantId"], f"{label}.merchantId")
    if not isinstance(policy["enabled"], bool):
        raise SellerInputError(f"{label}.enabled is invalid")
    _safe_integer(policy["shippingCents"], f"{label}.shippingCents", 0)
    for field in ("arrivalCalendarDays", "warrantyMonths", "returnDays"):
        _safe_integer(policy[field], f"{label}.{field}", 0)


def _normalized_number(value: Any, unit: Optional[str]) -> Optional[Tuple[str, float]]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if unit is None:
        return ("unitless", float(value))
    definition = NUMERIC_UNITS.get(unit)
    if definition is None:
        return None
    return (definition[0], float(value) * definition[1])


def _same_value(left: Any, right: Any) -> bool:
    if isinstance(left, list) and isinstance(right, list):
        return left == right
    return left == right


def _requirement_status(requirement: Mapping[str, Any], attribute: Optional[Mapping[str, Any]]) -> str:
    if attribute is None or attribute.get("value") is None:
        return "unknown"
    actual = attribute["value"]
    expected = requirement["value"]
    operator = requirement["operator"]
    requirement_unit = requirement["unit"]
    actual_unit = attribute.get("unit")

    if operator in ("min", "max"):
        actual_number = _normalized_number(actual, actual_unit)
        expected_number = _normalized_number(expected, requirement_unit)
        if actual_number is None or expected_number is None or actual_number[0] != expected_number[0]:
            return "unknown"
        if operator == "min":
            return "satisfied" if actual_number[1] >= expected_number[1] else "unmet"
        return "satisfied" if actual_number[1] <= expected_number[1] else "unmet"

    if requirement_unit != actual_unit:
        return "unknown"
    if operator == "equals":
        return "satisfied" if _same_value(actual, expected) else "unmet"
    if operator == "in":
        if not isinstance(expected, list):
            return "unknown"
        return "satisfied" if actual in expected else "unmet"
    if operator == "containsAll":
        if not isinstance(actual, list) or not isinstance(expected, list):
            return "unknown"
        return "satisfied" if all(item in actual for item in expected) else "unmet"
    return "unknown"


def _candidate_for_line(line: Mapping[str, Any], catalog: Sequence[Mapping[str, Any]], used_listing_ids: set[str]) -> Optional[Mapping[str, Any]]:
    candidates: List[Tuple[int, int, str, Mapping[str, Any]]] = []
    for snapshot in catalog:
        variant = snapshot["variant"]
        listing = snapshot["listing"]
        listing_id = listing["listing"]["id"]
        if listing_id in used_listing_ids:
            continue
        if variant["category"] != line["category"] or variant["profile"] != line["profile"]:
            continue
        if listing["condition"] not in line["allowedConditions"]:
            continue
        if snapshot["availableQuantity"] < line["quantity"]:
            continue
        attributes = variant["attributes"]
        statuses = [_requirement_status(requirement, attributes.get(requirement["fieldId"])) for requirement in line["requirements"]]
        if any(status != "satisfied" for requirement, status in zip(line["requirements"], statuses) if requirement["strength"] == "hard"):
            continue
        soft_score = sum(requirement["weight"] for requirement, status in zip(line["requirements"], statuses) if requirement["strength"] == "soft" and status == "satisfied")
        candidates.append((-soft_score, listing["referenceUnitCents"], listing_id, snapshot))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1], item[2]))
    return candidates[0][3]


def _v2_envelope(root: Mapping[str, Any], phase: str) -> Dict[str, Any]:
    return {
        "schemaVersion": 2,
        "jobId": root["jobId"],
        "councilId": root["councilId"],
        "request": root["request"],
        "runId": root["runId"],
        "snapshot": root["snapshot"],
        "snapshotDigest": root["snapshotDigest"],
        "phase": phase,
        "deadlineAt": root["deadlineAt"],
    }


def _build_advocacy(value: Any) -> Dict[str, Any]:
    root = validate_v2_input(value, "seller_advocacy")
    own_offers = set((offer["id"], offer["version"]) for offer in root["ownOffers"])
    facts_by_offer: Dict[Tuple[str, int], List[Mapping[str, Any]]] = {}
    for fact in root["facts"]:
        facts_by_offer.setdefault((fact["offer"]["id"], fact["offer"]["version"]), []).append(fact)
    defenses: List[Dict[str, Any]] = []
    for offer_ref in root["ownOffers"][:2]:
        facts = facts_by_offer.get((offer_ref["id"], offer_ref["version"]), [])[:4]
        defenses.append({
            "ownOffer": offer_ref,
            "text": "Seller confirms the frozen offer using only the approved public facts.",
            "factIds": [fact["id"] for fact in facts],
            "sourceIds": [source for fact in facts for source in fact["sourceIds"]][:40],
        })
    challenge: Optional[Dict[str, Any]] = None
    for fact in root["facts"]:
        offer_ref = (fact["offer"]["id"], fact["offer"]["version"])
        if offer_ref in own_offers or fact["status"] not in ("unmet", "unknown"):
            continue
        challenge = {
            "targetOffer": fact["offer"],
            "question": "Please verify the recorded public fact for this frozen offer.",
            "sourceIds": fact["sourceIds"][:40],
            "claimId": None,
            "factId": fact["id"],
        }
        break
    result = {**_v2_envelope(root, "advocacy"), "defenses": defenses, "challenge": challenge}
    validate_v2_output(result, "seller_advocacy")
    return result


def _build_reply(value: Any) -> Dict[str, Any]:
    root = validate_v2_input(value, "seller_reply")
    if not root["challenges"]:
        raise SellerInputError("seller reply has no admitted challenge to answer")
    answers: List[Dict[str, Any]] = []
    for challenge in root["challenges"][:2]:
        answers.append({
            "challengeId": challenge["id"],
            "disposition": "unknown",
            "text": "Seller acknowledges that the recorded public facts do not establish a further claim.",
            "factIds": [],
            "sourceIds": [],
        })
    result = {**_v2_envelope(root, "reply"), "answers": answers}
    validate_v2_output(result, "seller_reply")
    return result


def _build_final(value: Any) -> Dict[str, Any]:
    root = validate_v2_input(value, "seller_final")
    result = {
        "schemaVersion": 2,
        "jobId": root["jobId"],
        "roundId": root["roundId"],
        "councilId": root["councilId"],
        "snapshot": root["snapshot"],
        "snapshotDigest": root["snapshotDigest"],
        "outcomeVersion": root["outcomeVersion"],
        "candidateId": root["candidateId"],
        "decision": {"kind": "hold", "jobId": root["jobId"], "offer": root["ownOffer"]["offer"]},
    }
    validate_v2_output(result, "seller_final")
    return result


def build_decision(value: Any, role: Optional[str] = None) -> Dict[str, Any]:
    """Build a SellerDecision that Convex can validate independently."""

    if role == "seller_advocacy":
        return _build_advocacy(value)
    if role == "seller_reply":
        return _build_reply(value)
    if role == "seller_final":
        return _build_final(value)
    if role not in (None, "seller_initial", "seller_response"):
        raise SellerInputError("unsupported seller role")

    root = validate_provider_input(value)
    job = root["job"]
    if role is not None and job["role"] != role:
        raise SellerInputError("seller role does not match the input")
    job_id = job["jobId"]
    policy = root["policy"]
    if policy is None:
        return {"kind": "abstain", "jobId": job_id, "reasonCode": "NO_POLICY"}
    if not policy["enabled"]:
        return {"kind": "abstain", "jobId": job_id, "reasonCode": "POLICY_DISABLED"}

    used_listing_ids: set[str] = set()
    proposal_lines: List[Dict[str, Any]] = []
    selected_titles: List[str] = []
    for line in root["brief"]["lines"]:
        snapshot = _candidate_for_line(line, root["catalog"], used_listing_ids)
        if snapshot is None:
            return {"kind": "abstain", "jobId": job_id, "reasonCode": "NO_MATCH"}
        listing = snapshot["listing"]
        listing_id = listing["listing"]["id"]
        used_listing_ids.add(listing_id)
        selected_titles.append(snapshot["variant"]["title"])
        proposal_lines.append(
            {
                "requestLineId": line["lineId"],
                "listing": {"id": listing_id, "version": listing["listing"]["version"]},
                "quantity": line["quantity"],
                # Reference price is public. The Convex validator recomputes
                # the hidden floor and never trusts this value as authority.
                "unitCents": listing["referenceUnitCents"],
            }
        )

    titles = ", ".join(selected_titles)
    return {
        "kind": "propose",
        "proposal": {
            "schemaVersion": 1,
            "jobId": job_id,
            "candidateId": job["candidateIds"][0],
            "parentOffer": None,
            "policy": {"id": policy["policy"]["id"], "version": policy["policy"]["version"]},
            "lines": proposal_lines,
            "claims": [],
            "fitArgument": f"Selected {titles} from the seller catalog after checking category, profile, condition, stock, and hard requirements.",
            "privatePriceRationale": "Submitted the public reference price; Convex recomputes the merchant floor and delivered total.",
        },
    }
