import type { Contract } from "../../src/contracts/index.ts";
import { contracts } from "../../src/contracts/index.ts";
import { profiles } from "../lib/sellerFixtures.ts";
export function fixtureIntake(
  draft: Contract<"DraftView">,
): Contract<"IntakeResult"> {
  const buyers = draft.messages.filter((m) => m.role === "buyer");
  const raw = buyers.map((m) => m.text).join("\n");
  const category = /laptop|macbook|thinkpad|computer/i.test(raw)
    ? "laptop"
    : /headphone|earbud|earphone|\bxm5\b|wh-1000/i.test(raw)
      ? "headphones"
      : /shirt|tee|cotton/i.test(raw)
      ? "clothing"
      : /shelf|household/i.test(raw)
        ? "household_accessory"
        : /kettle|appliance/i.test(raw)
          ? "small_appliance"
          : null;
  const unresolved: string[] = [];
  const amount = [
    ...raw.matchAll(
      /(?:under|budget(?:\s+is)?|maximum(?:\s+is)?|around)\s*\$?([\d,]+(?:\.\d{1,2})?)(?!\d)/gi,
    ),
  ].at(-1);
  const maximum = amount
    ? Math.round(Number(amount[1].replaceAll(",", "")) * 100)
    : null;
  const date = raw.match(/\b(20\d\d-\d{2}-\d{2})\b/);
  let deadline: number | null = null;
  if (date) {
    // Proposed local end-of-day; confirmation remains required.
    const noon = Date.parse(`${date[1]}T12:00:00Z`);
    if (Number.isFinite(noon)) {
      const offset = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        timeZoneName: "longOffset",
      })
        .formatToParts(noon)
        .find((p) => p.type === "timeZoneName")!.value;
      deadline = Date.parse(`${date[1]}T23:59:59${offset.replace("GMT", "")}`);
    }
  }
  if (!category) unresolved.push("category");
  if (!maximum) unresolved.push("privateMaximumCents");
  if (!deadline) unresolved.push("deliveryDeadline");
  const lines: Contract<"RequestLine">[] = [];
  const origins: Contract<"IntakeResult">["origins"] = [];
  if (category) {
    const requirements: Contract<"Requirement">[] = [];
    function add(
      fieldId: string,
      operator: Contract<"Requirement">["operator"],
      value: Contract<"Requirement">["value"],
      unit: string | null,
      pattern: RegExp,
    ) {
      const message = buyers.find((m) => pattern.test(m.text));
      if (!message) return;
      const match = message.text.match(pattern)!;
      const requirementId = `r-${requirements.length + 1}`;
      requirements.push({
        id: requirementId,
        fieldId,
        operator,
        value,
        unit,
        strength: "hard",
        weight: 1,
      });
      origins.push({
        requirementId,
        messageId: message.id,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        explicit: true,
        buyerConfirmed: false,
      });
    }
    if (category === "laptop") {
      if (/windows/i.test(raw))
        add("osFamily", "equals", "Windows", null, /windows/i);
      if (/macbook|macos/i.test(raw))
        add("osFamily", "equals", "macOS", null, /macbook|macos/i);
      const ram = raw.match(/(\d+)\s*GB\s*(?:RAM|memory)/i);
      if (ram)
        add(
          "ramGb",
          "min",
          Number(ram[1]),
          "GB",
          /(\d+)\s*GB\s*(?:RAM|memory)/i,
        );
      const storage = raw.match(/(\d+)\s*GB\s*(?:SSD|storage)/i);
      if (storage)
        add(
          "storageGb",
          "min",
          Number(storage[1]),
          "GB",
          /(\d+)\s*GB\s*(?:SSD|storage)/i,
        );
    }
    if (category === "clothing") {
      if (/navy/i.test(raw)) add("color", "equals", "navy", null, /navy/i);
      const size = raw.match(/size\s+(S|M|L|XL)\b/i);
      if (size)
        add(
          "sizeLabel",
          "equals",
          size[1].toUpperCase(),
          null,
          /size\s+(S|M|L|XL)\b/i,
        );
      if (/100%\s*cotton/i.test(raw))
        add("material", "containsAll", ["cotton:100"], null, /100%\s*cotton/i);
    }
    if (category === "household_accessory") {
      const width = raw.match(
        /(?:under|max(?:imum)?(?:\s+width)?|at most)\s*(\d+)\s*mm/i,
      );
      if (width)
        add(
          "widthMm",
          "max",
          Number(width[1]),
          "mm",
          /(?:under|max(?:imum)?(?:\s+width)?|at most)\s*(\d+)\s*mm/i,
        );
    }
    if (category === "headphones") {
      const color = raw.match(/\b(black|silver|white|blue)\b/i);
      if (color)
        add("color", "equals", color[1].toLowerCase(), null, /\b(black|silver|white|blue)\b/i);
      const style = raw.match(/\b(over|on|in)[- ]ear\b/i);
      if (style)
        add("headphoneType", "equals", `${style[1].toLowerCase()}-ear`, null, /\b(over|on|in)[- ]ear\b/i);
      const battery = raw.match(/(\d{1,3})\+?\s*(?:h\b|hr|hrs|hours?)/i);
      if (battery)
        add("batteryHours", "min", Number(battery[1]), "h", /(\d{1,3})\+?\s*(?:h\b|hr|hrs|hours?)/i);
      if (/noise[- ]cancel|\banc\b/i.test(raw))
        add("noiseCancelling", "equals", true, null, /noise[- ]cancel|\banc\b/i);
    }
    if (category === "small_appliance" && /\bUS\b|120\s*V/i.test(raw)) {
      add("voltage", "equals", 120, "V", /\bUS\b|120\s*V/i);
      add("frequency", "equals", 60, "Hz", /\bUS\b|120\s*V/i);
      add("plugRegion", "equals", "US", null, /\bUS\b|120\s*V/i);
    }
    const profile =
      category === "laptop"
        ? profiles.laptop
        : category === "clothing"
          ? profiles.clothing
          : category === "household_accessory"
            ? profiles.household
            : category === "headphones"
              ? profiles.headphones
              : profiles.appliance;
    lines.push({
      lineId: "line-main",
      role: "primary",
      category,
      profile,
      quantity: 1,
      allowedConditions:
        /only new|new only/i.test(raw) ||
        ["clothing", "household_accessory", "headphones"].includes(category)
          ? ["new"]
          : ["new", "refurbished"],
      requirements,
      useCaseSummary: `Request for one ${category.replaceAll("_", " ")}.`,
    });
  }
  return contracts.IntakeResult.parse({
    expectedDraftVersion: draft.draftVersion,
    proposedLines: lines.length ? lines : null,
    proposedDeadline: deadline,
    proposedPrivateMaximumCents: maximum,
    proposedSharedTargetCents: null,
    origins,
    clarificationQuestions:
      category === "headphones"
        ? [
            ...(maximum ? [] : ["What is the most you want to spend, delivered?"]),
            ...(lines[0]?.requirements.some((r) => r.fieldId === "batteryHours")
              ? []
              : ["How many hours of battery life do you need?"]),
            ...(deadline ? [] : ["By what date do you need them?"]),
          ]
        : unresolved.length
          ? [
              "Please confirm the missing category, private maximum and delivery deadline in your brief.",
            ]
          : [],
    suggestedReplies:
      category === "headphones"
        ? [
            { id: "battery20", label: "20+ hours", text: "At least 20 hours of battery" },
            { id: "battery30", label: "30+ hours", text: "At least 30 hours of battery" },
            { id: "budget450", label: "Up to $450", text: "Budget is $450" },
          ]
        : category === "laptop"
        ? [
            { id: "battery", label: "Battery first", text: "Battery first" },
            { id: "new", label: "Only new", text: "Only new" },
          ]
        : [],
    unresolvedFields: unresolved,
  });
}
