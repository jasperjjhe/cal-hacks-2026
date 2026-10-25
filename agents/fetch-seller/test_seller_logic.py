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


def authority_for(payload, lowest_unit):
    own = payload["ownOffer"]
    unit = own["totalCents"] - own["shippingCents"]
    return {
        "schemaVersion": 2,
        "jobId": payload["jobId"],
        "candidateId": payload["candidateId"],
        "offer": own["offer"],
        "lines": [{
            "requestLineId": "line_main",
            "listing": own["lines"][0]["listing"],
            "quantity": 1,
            "unitCents": unit,
            "lowestAuthorizedUnitCents": lowest_unit,
        }],
        "shippingCents": own["shippingCents"],
        "totalCents": own["totalCents"],
    }


def with_rival_total(payload, total, matched=()):
    rival = payload["competition"]["offers"][1]
    rival["totalCents"] = total
    rival["checks"] = [
        {"requirementId": requirement_id, "status": "matched", "actual": None, "sourceIds": [], "explanation": "checked"}
        for requirement_id in matched
    ]
    return payload


class FinalPricingStrategyTests(unittest.TestCase):
    def proposal(self, payload, authority):
        result = build_decision(payload, "seller_final", authority)
        return result["decision"]

    def test_undercuts_a_comparable_rival_by_the_smallest_step_not_to_the_floor(self):
        payload = with_rival_total(final_input(), 99_000)
        decision = self.proposal(payload, authority_for(payload, 90_000))
        self.assertEqual(decision["kind"], "propose")
        proposal = decision["proposal"]
        # 0.5% of $990 is $4.95: $990.00 -> $985.05, far above the $915 authorized lowest total.
        self.assertEqual(proposal["lines"][0]["unitCents"], 97_005)
        self.assertEqual(proposal["parentOffer"], payload["ownOffer"]["offer"])
        self.assertEqual(proposal["policy"], payload["policy"])
        self.assertIsNone(proposal["serviceOptionId"])

    def test_holds_when_already_cheaper_than_every_comparable_rival(self):
        payload = with_rival_total(final_input(), 105_000)
        self.assertEqual(self.proposal(payload, authority_for(payload, 90_000))["kind"], "hold")

    def test_does_not_chase_a_rival_it_cannot_beat_within_authority(self):
        payload = with_rival_total(final_input(), 90_000)
        self.assertEqual(self.proposal(payload, authority_for(payload, 94_000))["kind"], "hold")

    def test_ignores_cheaper_rivals_with_worse_checked_fit(self):
        payload = with_rival_total(final_input(), 95_000)
        payload["ownOffer"]["checks"] = [
            {"requirementId": "r_weight", "status": "matched", "actual": 1240, "sourceIds": [], "explanation": "checked"},
        ]
        payload["competition"]["offers"][0] = payload["ownOffer"]
        self.assertEqual(self.proposal(payload, authority_for(payload, 90_000))["kind"], "hold")
        with_rival_total(payload, 95_000, matched=("r_weight",))
        self.assertEqual(self.proposal(payload, authority_for(payload, 90_000))["kind"], "propose")

    def test_unknown_checks_do_not_make_a_worse_fitting_rival_comparable(self):
        payload = final_input()
        payload["brief"]["lines"][0]["requirements"].append(
            {"id": "r_color", "fieldId": "color", "operator": "equals", "value": "black", "unit": None, "strength": "soft", "weight": 1})
        def check(rid, status):
            return {"requirementId": rid, "status": status, "actual": None, "sourceIds": [], "explanation": "checked"}
        payload["ownOffer"]["checks"] = [check("r_weight", "matched"), check("r_color", "unknown")]   # coverage 100
        payload["competition"]["offers"][0] = payload["ownOffer"]
        with_rival_total(payload, 95_000)
        payload["competition"]["offers"][1]["checks"] = [check("r_weight", "matched"), check("r_color", "unmet")]  # 67
        self.assertEqual(self.proposal(payload, authority_for(payload, 90_000))["kind"], "hold")

    def test_holds_at_the_authorized_lowest_price(self):
        payload = with_rival_total(final_input(), 90_000)
        unit = payload["ownOffer"]["totalCents"] - payload["ownOffer"]["shippingCents"]
        self.assertEqual(self.proposal(payload, authority_for(payload, unit))["kind"], "hold")

    def test_meets_a_reachable_shared_target_exactly(self):
        payload = with_rival_total(final_input(), 120_000)
        payload["brief"]["sharedTarget"] = {"amountCents": 96_000, "consentId": "consent_1", "consentedAt": 1_700_000_000_000}
        decision = self.proposal(payload, authority_for(payload, 90_000))
        self.assertEqual(decision["kind"], "propose")
        self.assertEqual(decision["proposal"]["lines"][0]["unitCents"] + payload["ownOffer"]["shippingCents"], 96_000)

    def test_a_low_target_does_not_pull_the_merchant_to_its_lowest_price(self):
        payload = with_rival_total(final_input(), 120_000)
        # Room is $990 - $915 = $75. A $916 target would need $74 of it (more than half): hold.
        payload["brief"]["sharedTarget"] = {"amountCents": 91_600, "consentId": "consent_1", "consentedAt": 1_700_000_000_000}
        self.assertEqual(self.proposal(payload, authority_for(payload, 90_000))["kind"], "hold")

    def test_rejects_authority_that_does_not_match_the_frozen_offer(self):
        payload = final_input()
        authority = authority_for(payload, 90_000)
        authority["totalCents"] += 1
        with self.assertRaises(SellerInputError):
            build_decision(payload, "seller_final", authority)
        authority = authority_for(payload, 90_000)
        authority["lines"][0]["lowestAuthorizedUnitCents"] = authority["lines"][0]["unitCents"] + 1
        with self.assertRaises(SellerInputError):
            build_decision(payload, "seller_final", authority)
        authority = authority_for(payload, 90_000)
        authority["operatorFloorCents"] = 1
        with self.assertRaises(SellerInputError):
            build_decision(payload, "seller_final", authority)

    def test_allocation_spreads_concession_by_room_and_respects_each_lowest_price(self):
        from seller_logic import _allocate_concession
        authority = {"lines": [
            {"requestLineId": "a", "listing": {"id": "l_a", "version": 1}, "quantity": 2, "unitCents": 10_000, "lowestAuthorizedUnitCents": 9_000},
            {"requestLineId": "b", "listing": {"id": "l_b", "version": 1}, "quantity": 1, "unitCents": 5_000, "lowestAuthorizedUnitCents": 4_999},
        ]}
        for concession in (1, 333, 1_000, 2_001):
            lines = _allocate_concession(authority, concession)
            reduction = sum(line["quantity"] * (original["unitCents"] - line["unitCents"]) for line, original in zip(lines, authority["lines"]))
            self.assertGreaterEqual(reduction, concession)
            for line, original in zip(lines, authority["lines"]):
                self.assertGreaterEqual(line["unitCents"], original["lowestAuthorizedUnitCents"])
                self.assertLessEqual(line["unitCents"], original["unitCents"])


if __name__ == "__main__":
    unittest.main()
