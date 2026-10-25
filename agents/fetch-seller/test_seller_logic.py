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


class SellerLogicTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()

