import { z } from "zod";

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (time: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(time);
export const dateInput = (time: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
export type Category =
  | "laptop"
  | "clothing"
  | "household_accessory"
  | "small_appliance"
  | "unsupported";
export const categories: Record<Category, string> = {
  laptop: "Laptop",
  clothing: "Clothing",
  household_accessory: "Household",
  small_appliance: "Small appliance",
  unsupported: "Not identified yet",
};

const mockOfferSchema = z.object({
  id: z.string(),
  merchant: z.string(),
  title: z.string(),
  variant: z.string(),
  condition: z.enum(["new", "refurbished"]),
  category: z.enum([
    "laptop",
    "clothing",
    "household_accessory",
    "small_appliance",
    "unsupported",
  ]),
  initial: z.int().nonnegative(),
  total: z.int().nonnegative(),
  shipping: z.int().nonnegative(),
  days: z.int().nonnegative(),
  warranty: z.int().nonnegative(),
  returns: z.int().nonnegative(),
  specs: z.array(z.string()),
  take: z.string(),
  concern: z.string(),
  image: z.string().nullable(),
  source: z.string().nullable(),
});
export type MockOffer = z.infer<typeof mockOfferSchema>;
const journeySchema = z.enum([
  "chat",
  "progress",
  "results",
  "approval",
  "receipt",
]);
export const runDurationMs = 6500;

const stateSchema = z.object({
  schemaVersion: z.literal(1),
  journey: journeySchema.optional(),
  page: z.enum([
    "home",
    "chat",
    "progress",
    "results",
    "approval",
    "receipt",
    "saved",
    "orders",
    "settings",
  ]),
  version: z.int().positive(),
  messages: z
    .array(
      z.object({
        role: z.enum(["buyer", "assistant"]),
        text: z.string().max(4000),
      }),
    )
    .max(100),
  category: z.enum([
    "laptop",
    "clothing",
    "household_accessory",
    "small_appliance",
    "unsupported",
  ]),
  prompt: z.string().max(4000),
  budget: z.string().max(20),
  deadline: z.string().max(10),
  allowRefurbished: z.boolean(),
  shareTarget: z.boolean(),
  target: z.string().max(20),
  preference: z.string().max(100),
  confirmed: z.boolean(),
  runStartedAt: z.number().nullable(),
  saved: z.array(z.string()).max(20),
  quote: z
    .object({
      offerId: z.string(),
      version: z.int(),
      expiresAt: z.number(),
      totalCents: z.int(),
      quoteId: z.string(),
      offerSnapshot: mockOfferSchema.optional(),
      arrivalDate: z.string().optional(),
    })
    .nullable(),
  orders: z
    .array(
      z.object({
        id: z.string(),
        offerId: z.string(),
        totalCents: z.int(),
        createdAt: z.number(),
        offerSnapshot: mockOfferSchema.optional(),
        arrivalDate: z.string().optional(),
      }),
    )
    .max(100),
});
export type MockState = z.infer<typeof stateSchema>;
const laptopBase = {
  category: "laptop" as const,
  specs: ["16GB RAM", "512GB SSD", "New"],
  condition: "new" as const,
  returns: 14,
  source: "https://support.apple.com/en-us/122209",
};
export const catalog: MockOffer[] = [
  {
    ...laptopBase,
    id: "a-p3",
    merchant: "Demo Merchant A",
    title: "MacBook Air 13-inch M4",
    variant: "P3",
    initial: 99500,
    total: 97500,
    shipping: 1500,
    days: 3,
    warranty: 12,
    take: "A new 16GB / 512GB configuration, with an authorized $20 demo concession.",
    concern:
      "Delivery takes three days; the seller warranty is shorter than Merchant B’s.",
    image: "/images/laptop-workspace.png",
  },
  {
    ...laptopBase,
    id: "b-p3",
    merchant: "Demo Merchant B",
    title: "MacBook Air 13-inch M4",
    variant: "P3",
    initial: 100000,
    total: 97000,
    shipping: 0,
    days: 1,
    warranty: 24,
    returns: 30,
    take: "The same configuration with next-day demo delivery and a longer seller warranty.",
    concern:
      "Owner evidence has not been retrieved. Product photos are illustrative.",
    image: "/images/laptop-studio.png",
  },
  {
    ...laptopBase,
    id: "c-p5",
    merchant: "Demo Merchant C",
    title: "ThinkPad T14 Gen 5",
    variant: "P5",
    initial: 68000,
    total: 68000,
    shipping: 0,
    days: 2,
    warranty: 12,
    condition: "refurbished",
    specs: ["16GB RAM", "512GB SSD", "Refurbished"],
    take: "A Windows alternative at a lower delivered price. This merchant holds its price.",
    concern:
      "85% battery health is a synthetic diagnostic, not a certified inspection.",
    image: "/images/laptop-editing.png",
    source: "https://psref.lenovo.com/Detail/2475?M=21ML0053US",
  },
  ...(["clothing", "household_accessory", "small_appliance"] as const).flatMap(
    (category, c) =>
      ["A", "B", "C"].map((merchant, i) => {
        const prices = [2500, 8000, 4500];
        const price = prices[c];
        const shipping = i === 0 ? 1500 : 0;
        return {
          id: `${merchant}-${category}`,
          merchant: `Demo Merchant ${merchant}`,
          category,
          title: ["DemoWear navy tee", "Demo Shelf", "Demo Kettle"][c],
          variant: ["C1", "H1", "A1"][c],
          condition: "new" as const,
          initial: price + shipping,
          total: (i === 2 ? price : price * 0.9) + shipping,
          shipping,
          days: [3, 1, 2][i],
          warranty: i === 1 ? 24 : 12,
          returns: i === 1 ? 30 : 14,
          specs: [
            ["Size M", "100% cotton", "Navy"],
            ["500mm wide", "Wood", "Freestanding"],
            ["1.5 litres", "120V / 60Hz", "US plug"],
          ][c],
          take: "Matches this category’s disclosed sample configuration. All commercial terms are fictional.",
          concern:
            "Fictional product: real owner reviews and certification are unavailable.",
          image: null,
          source: null,
        };
      }),
  ),
];

export function initialState(): MockState {
  return {
    schemaVersion: 1,
    page: "home",
    journey: "chat",
    version: 1,
    messages: [],
    category: "laptop",
    prompt: "",
    budget: "",
    deadline: "",
    allowRefurbished: true,
    shareTarget: false,
    target: "",
    preference: "Balanced",
    confirmed: false,
    runStartedAt: null,
    saved: [],
    quote: null,
    orders: [],
  };
}
export function restoreState(raw: string | null): MockState {
  if (!raw) return initialState();
  try {
    const state = stateSchema.parse(JSON.parse(raw));
    // Old local sessions did not record a stage or exact quote terms. Preserve
    // their history, but require a fresh selection instead of guessing a quote.
    if (
      state.quote &&
      (!state.quote.offerSnapshot || !state.quote.arrivalDate)
    ) {
      state.quote = null;
      if (state.page === "approval")
        state.page = state.confirmed ? "results" : "chat";
    }
    state.journey ??= journeyStage(state);
    return state;
  } catch {
    return initialState();
  }
}
export function inferCategory(text: string): Category {
  if (/laptop|macbook|thinkpad|computer|figma/i.test(text)) return "laptop";
  if (/shirt|tee|clothing|cotton/i.test(text)) return "clothing";
  if (/shelf|household|furniture/i.test(text)) return "household_accessory";
  if (/kettle|appliance/i.test(text)) return "small_appliance";
  return "unsupported";
}
export function sendMessage(state: MockState, text: string): MockState {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return state;
  const first = !state.prompt;
  const category = first ? inferCategory(clean) : state.category;
  const amount = clean.match(
    /(?:under|budget(?:\s+is)?|maximum(?:\s+is)?|around)\s*\$?([\d,]+(?:\.\d{1,2})?)/i,
  );
  const budget = amount ? amount[1].replaceAll(",", "") : state.budget;
  const preference =
    [
      "Balanced",
      "Battery first",
      "Graphics first",
      "Repairability",
      "Lowest price",
      "Soonest arrival",
    ].find((reply) => reply.toLowerCase() === clean.toLowerCase()) ??
    state.preference;
  const reply =
    category === "unsupported"
      ? "This mock supports laptops, clothing, shelves and kettles. Choose a category in your brief, or try one of the examples."
      : first
        ? "I’ve drafted a brief from your message. Review the category, private maximum and delivery date before we ask merchants. What matters most to you?"
        : "I’ve added that to your conversation. This is a scripted mock, so please use the editable brief to confirm any requirement changes.";
  return {
    ...state,
    page: "chat",
    journey: "chat",
    shareTarget: false,
    target: "",
    preference,
    prompt: first ? clean : state.prompt,
    category,
    budget,
    confirmed: false,
    quote: null,
    version: state.version + 1,
    runStartedAt: null,
    messages: [
      ...state.messages,
      { role: "buyer" as const, text: clean },
      { role: "assistant" as const, text: reply },
    ].slice(-100),
  };
}
export function parseDollars(input: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
export function confirmationError(
  state: MockState,
  now = Date.now(),
): string | null {
  const amount = parseDollars(state.budget);
  if (!state.prompt) return "Describe what you need first.";
  if (state.category === "unsupported")
    return "Choose a supported category before confirming.";
  if (amount === null)
    return "Enter a positive private maximum, with at most two decimal places.";
  if (!isDateOnly(state.deadline) || state.deadline < dateInput(now))
    return "Choose a valid delivery date today or later.";
  const target = parseDollars(state.target);
  if (state.shareTarget && (target === null || target > amount))
    return "Your shared target must be positive and no more than your private maximum.";
  return null;
}
export function matchingOffers(
  state: MockState,
  now = Date.now(),
  refresh = false,
) {
  const arrivalBase = refresh ? now : (state.runStartedAt ?? now);
  return catalog.filter(
    (offer) =>
      offer.category === state.category &&
      (state.allowRefurbished || offer.condition === "new") &&
      offer.total <= (parseDollars(state.budget) ?? 0) &&
      deliveryDate(arrivalBase, offer.days) <= state.deadline,
  );
}

export function noMatchReason(state: MockState, now: number): string {
  const categoryOffers = catalog.filter(
    (offer) => offer.category === state.category,
  );
  const conditionOffers = categoryOffers.filter(
    (offer) => state.allowRefurbished || offer.condition === "new",
  );
  if (!conditionOffers.length)
    return "The sample catalog has no stock in your confirmed category and condition.";
  const affordable = conditionOffers.filter(
    (offer) => offer.total <= (parseDollars(state.budget) ?? 0),
  );
  if (!affordable.length)
    return `The lowest delivered sample price for this condition is ${money(Math.min(...conditionOffers.map((offer) => offer.total)))}. It exceeds your private maximum.`;
  const earliest = affordable
    .map((offer) => deliveryDate(state.runStartedAt ?? now, offer.days))
    .sort()[0];
  if (earliest > state.deadline)
    return `Offers within your private maximum arrive no earlier than ${dateOnlyLabel(earliest)}, after your ${dateOnlyLabel(state.deadline)} deadline.`;
  return "No current sample offer meets all confirmed requirements. Edit your brief to explore other options.";
}
export function reserve(
  state: MockState,
  offerId: string,
  now: number,
): MockState {
  if (!state.confirmed || state.runStartedAt === null)
    throw new Error("Confirm and complete a request first.");
  if (
    state.orders.some(
      (order) => order.id === `order-${state.runStartedAt}-${state.version}`,
    )
  )
    throw new Error("This request already has a demo order.");
  if (!["results", "approval"].includes(journeyStage(state)))
    throw new Error("Confirm and complete a request first.");
  const offer = matchingOffers(state, now, true).find(
    (offer) => offer.id === offerId,
  );
  if (!offer)
    throw new Error(
      "This offer no longer matches your confirmed brief or delivery deadline.",
    );
  const existing = state.quote;
  const quote =
    existing?.offerId === offerId &&
    existing.version === state.version &&
    existing.expiresAt > now
      ? existing
      : {
          offerId,
          version: state.version,
          expiresAt: now + 180000,
          totalCents: offer.total,
          quoteId: `quote-${now}-${state.version}`,
          offerSnapshot: structuredClone(offer),
          arrivalDate: deliveryDate(now, offer.days),
        };
  return { ...state, page: "approval", journey: "approval", quote };
}
export function approve(state: MockState, now: number): MockState {
  const quote = state.quote;
  if (!quote || !state.confirmed || quote.version !== state.version)
    throw new Error("The brief changed. Choose an offer again.");
  const id = `order-${state.runStartedAt}-${state.version}`;
  if (state.orders.some((order) => order.id === id))
    return { ...state, page: "receipt", journey: "receipt" };
  if (quote.expiresAt <= now)
    throw new Error(
      "Your quote expired. Return to comparison for a fresh quote.",
    );
  const offer = matchingOffers(state, now).find(
    (offer) => offer.id === quote.offerId,
  );
  if (
    !offer ||
    !quote.offerSnapshot ||
    !quote.arrivalDate ||
    !sameTerms(offer, quote.offerSnapshot) ||
    offer.total !== quote.totalCents ||
    quote.arrivalDate > state.deadline ||
    quote.arrivalDate < dateInput(now)
  )
    throw new Error("The offer changed. Review a fresh quote.");
  return {
    ...state,
    page: "receipt",
    journey: "receipt",
    orders: [
      ...state.orders,
      {
        id,
        offerId: offer.id,
        totalCents: quote.totalCents,
        createdAt: now,
        offerSnapshot: structuredClone(quote.offerSnapshot),
        arrivalDate: quote.arrivalDate,
      },
    ].slice(-100),
  };
}

function sameTerms(a: MockOffer, b: MockOffer): boolean {
  // Select commercial/configuration fields in a stable order. JSON key order
  // after restoring browser storage, photos and generated prose aren't terms.
  const terms = (offer: MockOffer) => ({
    id: offer.id,
    merchant: offer.merchant,
    variant: offer.variant,
    category: offer.category,
    condition: offer.condition,
    total: offer.total,
    shipping: offer.shipping,
    days: offer.days,
    warranty: offer.warranty,
    returns: offer.returns,
    specs: [...offer.specs].sort(),
  });
  return JSON.stringify(terms(a)) === JSON.stringify(terms(b));
}

// Date-only arithmetic uses the delivery region's civil date, not elapsed
// 24-hour blocks (which shift a day around daylight-saving transitions).
export function deliveryDate(now: number, days: number): string {
  const date = new Date(`${dateInput(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function dateOnlyLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
function isDateOnly(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function journeyStage(state: MockState): z.infer<typeof journeySchema> {
  if (state.journey) return state.journey;
  if (journeySchema.safeParse(state.page).success)
    return state.page as z.infer<typeof journeySchema>;
  if (state.quote)
    return state.orders.some(
      (order) => order.id === `order-${state.runStartedAt}-${state.version}`,
    )
      ? "receipt"
      : "approval";
  return state.confirmed ? "results" : "chat";
}
export function tickRun(state: MockState, now: number): MockState {
  if (
    journeyStage(state) !== "progress" ||
    state.runStartedAt === null ||
    now - state.runStartedAt < runDurationMs
  )
    return state;
  return {
    ...state,
    journey: "results",
    page: state.page === "progress" ? "results" : state.page,
  };
}
export function navigate(
  state: MockState,
  page: MockState["page"],
  now: number,
): MockState {
  const current = tickRun(state, now);
  if (page === "chat") return { ...current, page: journeyStage(current) };
  return {
    ...current,
    page,
    ...(journeySchema.safeParse(page).success
      ? { journey: page as z.infer<typeof journeySchema> }
      : {}),
  };
}
type DraftPatch = Partial<
  Pick<
    MockState,
    | "category"
    | "budget"
    | "deadline"
    | "allowRefurbished"
    | "shareTarget"
    | "target"
    | "preference"
    | "page"
  >
>;
export function reviseDraft(state: MockState, patch: DraftPatch): MockState {
  const consentOnly = Object.keys(patch).every(
    (key) => key === "shareTarget" || key === "target",
  );
  return {
    ...state,
    ...(!consentOnly ? { shareTarget: false, target: "" } : {}),
    ...patch,
    journey: "chat",
    confirmed: false,
    quote: null,
    runStartedAt: null,
    version: state.version + 1,
  };
}
export function beginRun(state: MockState, now: number): MockState {
  const error = confirmationError(state, now);
  if (error) throw new Error(error);
  return {
    ...state,
    confirmed: true,
    page: "progress",
    journey: "progress",
    runStartedAt: now,
    quote: null,
  };
}
