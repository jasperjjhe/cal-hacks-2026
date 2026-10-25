import copy
import unittest

from seller_logic import SellerInputError, build_decision


def attribute(value, unit=None):
    return {
        "value": value,
        "unit": unit,
        "provenance": "synthetic_demo",
        "sourceId": None,
    }


def snapshot(variant_id, title, ram, storage, reference):
    return {
        "variant": {
            "id": variant_id,
            "productId": f"product_{variant_id}",
            "title": title,
            "category": "laptop",
            "profile": {"id": "profile_laptop", "version": 1},
            "manufacturerPartNumber": None,
            "attributes": {
                "osFamily": attribute("macOS"),
                "ramGb": attribute(ram, "GB"),
                "storageGb": attribute(storage, "GB"),
                "weightG": attribute(1240, "g"),
            },
            "syntheticProduct": True,
        },
        "listing": {
            "listing": {"id": f"merchant_a:{variant_id}", "version": 1},
            "merchantId": "merchant_a",
            "variantId": variant_id,
            "condition": "new",
            "unitId": None,
            "initialQuantity": 2,
            "referenceUnitCents": reference,
            "diagnosticAttributes": {},
        },
        "availableQuantity": 2,
    }


def sample_input():
    return {
        "schemaVersion": 1,
        "job": {
            "jobId": "job_fetch_test",
            "runId": "run_fetch_test",
            "phaseId": "phase_fetch_test",
            "role": "seller_initial",
            "merchantId": "merchant_a",
            "candidateIds": ["merchant_a:candidate:1"],
        },
        "merchant": {"merchantId": "merchant_a", "displayName": "Demo Seller"},
        "brief": {
            "schemaVersion": 1,
            "request": {"id": "req_fetch_test", "version": 1},
            "runId": "run_fetch_test",
            "currency": "USD",
            "deliveryRegion": "US-CA-SAN_FRANCISCO",
            "deliveryDeadline": 1_800_000_000_000,
            "lines": [
                {
                    "lineId": "line_main",
                    "role": "primary",
                    "category": "laptop",
                    "profile": {"id": "profile_laptop", "version": 1},
                    "quantity": 1,
                    "allowedConditions": ["new"],
                    "requirements": [
                        {"id": "r_os", "fieldId": "osFamily", "operator": "equals", "value": "macOS", "unit": None, "strength": "hard", "weight": 1},
                        {"id": "r_ram", "fieldId": "ramGb", "operator": "min", "value": 16, "unit": "GB", "strength": "hard", "weight": 1},
                        {"id": "r_storage", "fieldId": "storageGb", "operator": "min", "value": 512, "unit": "GB", "strength": "hard", "weight": 1},
                        {"id": "r_weight", "fieldId": "weightG", "operator": "max", "value": 1500, "unit": "g", "strength": "soft", "weight": 2},
                    ],
                    "useCaseSummary": "A laptop for coursework.",
                },
            ],
            "sharedTarget": None,
        },
        "catalog": [
            snapshot("P6", "DemoBook Low Memory", 8, 256, 48_000),
            snapshot("P3", "DemoBook Air", 16, 512, 99_000),
        ],
        "policy": {
            "policy": {"id": "merchant_a:policy", "version": 1},
            "merchantId": "merchant_a",
            "enabled": True,
            "shippingCents": 1_500,
            "arrivalCalendarDays": 3,
            "warrantyMonths": 12,
            "returnDays": 14,
        },
    }


def public_offer(merchant_id, candidate_id, offer_id):
    return {
        "merchantId": merchant_id,
        "candidateId": candidate_id,
        "offer": {"id": offer_id, "version": 1},
        "lines": [{
            "requestLineId": "line_main",
            "listing": {"id": f"{merchant_id}:P3", "version": 1},
            "variantId": "P3",
            "condition": "new",
            "quantity": 1,
            "configuration": {"ramGb": 16},
        }],
        "totalCents": 99_000,
        "shippingCents": 1_500,
        "arrivalAt": 1_800_000_000_000,
        "warrantyMonths": 12,
        "returnDays": 14,
        "checks": [],
        "claims": [],
    }


def council_input(role="seller_advocacy", challenges=None):
    own = public_offer("merchant_a", "candidate_a", "offer_a")
    rival = public_offer("merchant_b", "candidate_b", "offer_b")
    brief = {
        "schemaVersion": 1,
        "request": {"id": "request_1", "version": 1},
        "currency": "USD",
        "deliveryRegion": "US-CA-SAN_FRANCISCO",
        "deliveryDeadline": 1_800_000_000_000,
        "lines": sample_input()["brief"]["lines"],
        "sharedTarget": None,
    }
    fact = {
        "id": "fact_rival_1",
        "offer": rival["offer"],
        "dimension": "fit",
        "fieldId": "ramGb",
        "value": 8,
        "unit": "GB",
        "requirementId": "r_ram",
        "status": "unmet",
        "provenance": "synthetic_demo",
        "sourceIds": [],
    }
    snapshot = {
        "schemaVersion": 2,
        "snapshot": {"id": "snapshot_1", "version": 1},
        "councilId": "council_1",
        "request": {"id": "request_1", "version": 1},
        "runId": "run_1",
        "createdAt": 1_700_000_000_000,
        "brief": brief,
        "offers": [own, rival],
        "approvedFactIds": [fact["id"]],
        "approvedSourceIds": [],
    }
    return {
        "schemaVersion": 2,
        "jobId": "council_job_1",
        "councilId": "council_1",
        "request": {"id": "request_1", "version": 1},
        "runId": "run_1",
        "snapshot": {"id": "snapshot_1", "version": 1},
        "snapshotDigest": "digest_1",
        "phase": role.removeprefix("seller_") if role != "seller_final" else "reply",
        "deadlineAt": 1_800_000_000_000,
        "role": role,
        "merchantId": "merchant_a",
        "competition": snapshot,
        "facts": [fact],
        "ownOffers": [own["offer"]],
        "comparisons": [],
        "challenges": challenges or [],
        "defenses": [],
        "replies": [],
    }


def final_input():
    council = council_input()
    own = council["competition"]["offers"][0]
    return {
        "schemaVersion": 2,
        "jobId": "final_job_1",
        "roundId": "round_1",
        "councilId": "council_1",
        "snapshot": {"id": "snapshot_1", "version": 1},
        "snapshotDigest": "digest_1",
        "outcomeVersion": 1,
        "candidateId": "candidate_a",
        "merchantId": "merchant_a",
        "policy": {"id": "merchant_a:policy", "version": 1},
        "request": {"id": "request_1", "version": 1},
        "runId": "run_1",
        "deadlineAt": 1_800_000_000_000,
        "brief": council["competition"]["brief"],
        "ownOffer": own,
        "competition": council["competition"],
        "facts": council["facts"],
        "comparisons": [],
        "outcomes": [],
    }


def headphone_input(minimum_hours):
    value = sample_input()
    value["brief"]["lines"] = [{
        "lineId": "line_main",
        "role": "primary",
        "category": "headphones",
        "profile": {"id": "profile_headphones", "version": 1},
        "quantity": 1,
        "allowedConditions": ["new"],
        "requirements": [
            {"id": "r_color", "fieldId": "color", "operator": "equals", "value": "black", "unit": None, "strength": "hard", "weight": 1},
            {"id": "r_anc", "fieldId": "noiseCancelling", "operator": "equals", "value": True, "unit": None, "strength": "hard", "weight": 1},
            {"id": "r_battery", "fieldId": "batteryHours", "operator": "min", "value": minimum_hours, "unit": "h", "strength": "hard", "weight": 1},
        ],
        "useCaseSummary": "Black noise-cancelling headphones.",
    }]
    entry = snapshot("HP2", "Bose QuietComfort Ultra Headphones", 0, 0, 42_900)
    entry["variant"]["category"] = "headphones"
    entry["variant"]["profile"] = {"id": "profile_headphones", "version": 1}
    entry["variant"]["syntheticProduct"] = False
    entry["variant"]["attributes"] = {
        "color": attribute("black"),
        "noiseCancelling": attribute(True),
        "batteryHours": attribute(24, "h"),
        "weightG": attribute(254, "g"),
    }
    value["catalog"] = [entry]
    return value


class SellerLogicTests(unittest.TestCase):
    def test_embedded_schema_matches_generated_json(self):
        import json
        from pathlib import Path
        from seller_schema_data import SCHEMA_JSON
        self.assertEqual(json.loads(SCHEMA_JSON), json.loads(Path(__file__).with_name("seller.schema.json").read_text()))

    def test_hour_based_battery_requirement_matches_real_headphone_catalog(self):
        decision = build_decision(headphone_input(20), "seller_initial")
        self.assertEqual(decision["kind"], "propose")
        self.assertEqual(decision["proposal"]["lines"][0]["listing"]["id"], "merchant_a:HP2")
        # A bound above the product's rated battery life must reject it rather than read as unknown.
        self.assertEqual(build_decision(headphone_input(30), "seller_initial")["kind"], "abstain")

    def test_unit_table_matches_the_typescript_validator(self):
        import pathlib
        import re
        from seller_logic import NUMERIC_UNITS
        source = (pathlib.Path(__file__).resolve().parents[2] / "frontend/convex/lib/sellerValidation.ts").read_text()
        table = source[source.index("const NUMERIC_UNITS"):]
        table = table[:table.index("\n}\n")]
        typescript = {
            match.group(1).strip("'"): (match.group(2).strip("'"), float(match.group(3).replace("_", "")))
            for match in re.finditer(r"^\s*('?[A-Za-z%]+'?): \{ family: ('[a-z]+'), multiplier: ([0-9_.]+) \}", table, re.M)
        }
        self.assertEqual(typescript, dict(NUMERIC_UNITS))

    def test_agent_dispatch_accepts_explicit_opening_role(self):
        value = sample_input()
        self.assertEqual(build_decision(value, "seller_initial"), build_decision(value))
        with self.assertRaises(SellerInputError):
            build_decision(value, "seller_response")

    def test_selects_hard_requirement_match_and_public_reference_price(self):
        decision = build_decision(sample_input())
        self.assertEqual(decision["kind"], "propose")
        proposal = decision["proposal"]
        self.assertEqual(proposal["lines"][0]["listing"]["id"], "merchant_a:P3")
        self.assertEqual(proposal["lines"][0]["unitCents"], 99_000)
        self.assertEqual(proposal["policy"], {"id": "merchant_a:policy", "version": 1})

    def test_abstains_when_no_catalog_entry_satisfies_hard_requirements(self):
        payload = sample_input()
        payload["brief"]["lines"][0]["requirements"][1]["value"] = 64
        decision = build_decision(payload)
        self.assertEqual(decision, {"kind": "abstain", "jobId": "job_fetch_test", "reasonCode": "NO_MATCH"})

    def test_rejects_nested_private_fields_before_reasoning(self):
        payload = sample_input()
        payload["catalog"][0]["variant"]["attributes"]["privateMaximumCents"] = attribute(1)
        with self.assertRaises(SellerInputError):
            build_decision(payload)

    def test_does_not_mutate_the_provider_input(self):
        payload = sample_input()
        original = copy.deepcopy(payload)
        build_decision(payload)
        self.assertEqual(payload, original)

    def test_v2_advocacy_is_bound_to_generated_contract_and_public_snapshot(self):
        decision = build_decision(council_input(), "seller_advocacy")
        self.assertEqual(decision["phase"], "advocacy")
        self.assertEqual(decision["jobId"], "council_job_1")
        self.assertEqual(decision["challenge"]["factId"], "fact_rival_1")

    def test_v2_reply_answers_only_admitted_challenges(self):
        challenge = {
            "id": "challenge_1",
            "authorMerchantId": "merchant_b",
            "targetMerchantId": "merchant_a",
            "challenge": {
                "targetOffer": {"id": "offer_a", "version": 1},
                "question": "Please verify.",
                "sourceIds": [],
                "claimId": None,
                "factId": "fact_rival_1",
            },
        }
        payload = council_input("seller_reply", [challenge])
        decision = build_decision(payload, "seller_reply")
        self.assertEqual(decision["answers"][0]["challengeId"], "challenge_1")
        self.assertEqual(decision["answers"][0]["disposition"], "unknown")

    def test_v2_final_is_parent_bound_hold_when_pricing_is_not_authorized_in_input(self):
        decision = build_decision(final_input(), "seller_final")
        self.assertEqual(decision["decision"]["kind"], "hold")
        self.assertEqual(decision["decision"]["offer"], {"id": "offer_a", "version": 1})

    def test_v2_input_rejects_private_fields_and_unknown_schema_fields(self):
        payload = council_input()
        payload["privateMaximumCents"] = 1
        with self.assertRaises(SellerInputError):
            build_decision(payload, "seller_advocacy")
        payload = council_input()
        payload["unexpected"] = True
        with self.assertRaises(SellerInputError):
            build_decision(payload, "seller_advocacy")


if __name__ == "__main__":
    unittest.main()
