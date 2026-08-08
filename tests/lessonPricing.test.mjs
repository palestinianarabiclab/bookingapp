import test from "node:test";
import assert from "node:assert/strict";
import { historicalPriceLabel, pricingDifference, resolvePriceSnapshot, validPrice } from "../js/logic/lessonPricing.js";

test("custom price overrides the global default", () => {
    const snapshot = resolvePriceSnapshot({ defaultPrice: 20, customPrice: 15, version: "v1", capturedAt: 1 });
    assert.deepEqual(snapshot, { version: "v1", effectivePrice: 15, currency: "USD", source: "custom", defaultPrice: 20, customPrice: 15, capturedAt: 1 });
    assert.deepEqual(pricingDifference(snapshot), { amount: 5, kind: "discount" });
});

test("global default is used without a valid custom price", () => {
    const snapshot = resolvePriceSnapshot({ defaultPrice: 20, customPrice: 0, version: "v1", capturedAt: 1 });
    assert.equal(snapshot.effectivePrice, 20);
    assert.equal(snapshot.source, "default");
});

test("immutable historical snapshot does not change with later pricing", () => {
    const historical = resolvePriceSnapshot({ defaultPrice: 20, customPrice: 15, version: "old", capturedAt: 1 });
    resolvePriceSnapshot({ defaultPrice: 30, customPrice: 25, version: "new", capturedAt: 2 });
    assert.equal(historical.effectivePrice, 15);
    assert.equal(historical.defaultPrice, 20);
    assert.equal(historical.version, "old");
});

test("above-default custom price is an adjustment", () => {
    assert.deepEqual(pricingDifference(resolvePriceSnapshot({ defaultPrice: 15, customPrice: 20 })), { amount: 5, kind: "adjustment" });
});

test("legacy unknown prices are not invented", () => {
    assert.equal(resolvePriceSnapshot({ defaultPrice: 0, customPrice: null }), null);
    assert.equal(historicalPriceLabel(null), "Unavailable (legacy)");
    assert.equal(validPrice("not money"), null);
});
