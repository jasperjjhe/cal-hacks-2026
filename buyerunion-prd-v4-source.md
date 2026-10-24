# BuyerUnion PRD v4 - complete source conversion

Archived October 24, 2026 before revision. This is a full text conversion of the 29-page original, not the current implementation plan. Page order and extracted text are preserved, including historical decisions that the new plan supersedes. PDF table layout is flattened by extraction; source hyperlinks are retained in the ledger below.

Source: `buyerunion-audit-and-prd.pdf`

## PDF page 1

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
1
BuyerUnion | Complete Project PRD v4
CalHacks 13.0 | Revised October 23, 2026 | Product, engineering, economics and sponsor reference | No
length limit
1. Core Details and Why
Build: a marketplace for manufactured consumer products: buyers write a natural-language prompt; a neutral
assistant confirms its meaning; merchant agents find stock, make a fit argument and compete through
authorized variable prices; a bounded council challenges claims; independent web evidence informs the final
decision. Technology, household accessories, appliances and clothing share this flow. Laptops are a
demonstration, not the product boundary. Nothing is bought or fulfilled in the real world during the demo.
Confirmed scope: four teammates, two own UI in Figma; no existing application; manufactured products,
new/refurbished where applicable; U.S./USD; San Francisco delivery; buyer-selected deadline; disclosed mock
merchant stock/terms; real web evidence; Visa sandbox attempted, labeled simulation otherwise. No
language/framework preference. This supersedes both real-inventory-first and laptop-only assumptions.
Chosen defaults: TypeScript, React/Vite, Convex/Auth/Workflow, direct Gemini API, Apify; actual frontend
hosted on Vultr. Three fictional merchants; one primary product type and up to two related product types per
request, all from one merchant; at most five offer cards. Each line quantity is 1-10. Category profiles supply
typed rules; adding categories must not require changing the council, checkout or screen sequence. No
second database, real-money mode or multi-seller checkout.
Coverage boundary: the architecture accepts extensible product categories; launch profiles cover
laptops/tech accessories, clothing, household accessories and small appliances. Do not claim universal
verified inventory or evidence coverage. Unknown categories stay editable drafts until a validated profile exists.
Services, consumables and regulated goods are outside this prototype; large-appliance installation is not
promised.
Why: reduce buyer comparison work and merchant quotation effort while creating profitable opportunities to
win a purchase. The merchant agent protects its seller's contribution; the buyer assistant protects the buyer's
stated requirements and approval. The platform cannot promise to maximize both sides' surplus
simultaneously. Debate is useful only when it improves a valid offer or resolves a material claim. Longer
reasoning is not evidence of a better outcome.
Visa criterion
Required demonstration
Innovation 25%
Tailored merchant offers and a challenge that produces a useful
correction/concession; avoid claiming to invent RFQs.
UX 25%
Broad and precise input, editable requirements, concise progress,
understandable offers and clear purchase approval.
Technical 20%
Actual scoped tool calls, enforced policies, real source retrieval, persisted state
and recovery.
Commerce 15%
Measure comparison/quotation effort and fulfilled demo offers; no invented
savings or conversion uplift.
Trust 15%
Mock disclosure, separate commercial/private data, applicable citations, truthful
incomplete states and bounded approval.
Readiness boundary: this document resolves product and architecture choices sufficient to begin the demo. It
does not certify provider access, scraping success, measured performance, or prize eligibility. External access
and source/API smoke tests remain explicit gates. Live merchant adoption and economics remain future

## PDF page 2

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
2
validation questions, not prototype blockers.
v4 changes: removes the former ten-page limit; consolidates the project context and sponsor/prize strategy;
makes prompt-first intake, commercial bidding, optional shared targets, neutral fit scoring, conditional final bids
and independent sentiment explicit. Earlier reports remain research background; this document governs the
current implementation scope. Reading guide: overview/decisions and buyer flow first; commercial mechanics
in sections 7-10; implementation in 11-15 and 23-25; sponsor strategy in 16-19; research/risks/metrics in
20-22; external gates and sources in 26-27. Section numbers are not PDF page references.
2. Problem, user sentiment and product rationale
Buyer problem: shoppers repeatedly translate an everyday need into product filters, compare variants and
delivered prices, judge reviews, and check seller terms. The product should let people describe the outcome
once and compare a few defensible offers. Merchant problem: serving a relevant buyer can require catalog
search, stock checks, discretionary pricing and explanation; the agent acts as a controlled automated sales
desk.
Earlier research examined selected public shopper discussions and primary research. It supports comparison
friction and trust concerns, not proven demand for this marketplace. No representative sentiment scrape,
merchant commitment, original interview study or conversion experiment has been completed.
Observed theme
Evidence and design implication
Verifying AI advice creates work
Gartner's May 2026 release reports that 54% of recent shopping-AI users
double-checked all information. The underlying Nov-Dec 2025 survey had 846
U.S. consumers; this statistic concerns its AI-user subgroup. Provide inspectable
evidence, not another unsupported recommendation. [R1]
Assistance differs from purchase
authority
A separate January 2026 Gartner survey of 322 U.S. consumers found
willingness to delegate purchase decisions reached only 11% in the more
receptive categories studied. Keep final approval explicit. [R1]
Delivered cost and checkout friction
matter
Baymard identifies extra charges and checkout usability as abandonment drivers.
Show a comparable complete demo total before approval; do not translate a
general research finding into a promised conversion uplift. [R2]
Durability research is fragmented
Selected BuyItForLife discussions describe cross-checking reviews, warranties
and forums. Use exact-product evidence and preserve uncertainty. This is
anecdotal evidence, not a prevalence estimate. [R3]
Clothing size labels are unreliable
guides to fit
A selected PlusSize discussion describes inconsistent charts. Preserve
brand/size-system and measurement context; do not translate every M into the
same dimensions. [R4]
Returns and availability affect trust
Earlier research found accounts of refund uncertainty and advertised stock
mismatch, with conflicting experiences. Distinguish an offer, a stock hold and a
completed order; mock inventory cannot prove real fulfillment reliability.
User groups: broad-intent shoppers needing interpretation; precise shoppers with hard requirements;
merchants seeking profitable qualified demand; merchant operators defining authority. Their interests overlap
but differ: a merchant agent represents its seller, and the buyer assistant should explain that clearly.
Hypothesis: a prompt-led competitive offer process can reduce research/quotation effort while improving
acceptable purchase opportunities. Discounting alone is not the product; a reliable suitable offer and an
informed decision are. The central market risk is whether enough relevant merchants participate for each
category, location and deadline.

## PDF page 3

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
3
Success story to prove: a buyer writes an ordinary request; agents identify relevant variants, reject
unsuitable stock, produce a bounded commercial improvement, substantiate the fit argument and present
independent sentiment. The buyer can see why one offer is cheaper and another better meets a stated
preference without being pushed into a purchase.
3. Decision register and scope boundaries
This register separates confirmed user directions from implementation defaults. Defaults are concrete choices
for the build, not claims that the team has already implemented or tested them.
Status
Decision
Confirmed
General manufactured-products marketplace; laptops only an example/demo. Include
technology, clothing, household accessories and appliances in the model and fixtures.
Confirmed
Four people; two teammates handle UI in Figma. No initial application, merchant inventory or
sample data. No framework/language constraint.
Confirmed
Custom buyer UI; skip Fetch AI if the primary workflow must run inside ASI:One.
Confirmed
Natural-language buyer prompt; merchant agents do catalog/product work, fit arguments, council
and useful price competition; independent web sentiment closes the decision loop.
Confirmed
Disclosed mock inventory for the demo, because merchant authority is unlikely. Real evidence
must be real, applicable and cited.
Confirmed
New/refurbished where applicable; U.S./USD, San Francisco demo area and buyer-selected
deadline. Visa sandbox attempted, labeled simulation fallback.
Confirmed
Bidding is central; merchants may offer modest variable discounts to win profitable sales. One
council round acceptable; more compute only when useful. Former PRD length cap removed.
Proposed default
Neutral extraction/confirmation precedes merchant interpretation; private maximum plus optional
explicitly shared target. Merchant self-scores are advisory.
Proposed default
One initial private offer phase, one claims council, at most one sealed final-price revision phase;
one extra verification-only council when justified.
Proposed default
TypeScript/React/Vite, Convex/Auth/Workflow, direct Gemini API, Apify and genuine Vultr
frontend hosting. One primary database and orchestration path.
Proposed default
Three fictional merchants; maximum two active candidates each; one primary product type plus
two related types per single-merchant bundle; line quantities 1-10.
Proposed default
Merchant-specific discount caps, starting at 5-10% where permitted; floor/cost guards override
cap. Zero discount is allowed.
Prototype exclusions: live-money purchases, real fulfillment promises, cross-merchant atomic checkout,
escrow, automated returns/refunds, unsolicited seller outreach, user credit scoring, biometric fit prediction,
voice input, uploaded-photo analysis, public agent registration and arbitrary external merchant agents. These
are future extensions, not requirements hidden inside the first demo.
Coverage is explicit: launch category profiles prove the shared model; they do not prove every manufactured
item has known specifications or usable reviews. Unsupported products can remain draft requests until a
validated profile and supply exist. Services, consumables, regulated products and installation commitments
require separate scope decisions.
Terminology: request = confirmed buyer need; candidate = merchant's proposed bundle; offer version =
immutable proposed terms; council = claim/challenge/response; final bid = permitted commercial revision; fit
assessment = neutral requirement comparison; sentiment = attributed external reports; firm quote = selected
revalidated terms; reservation = stock allocation; approval = buyer authority; execution = one recorded
payment/demo attempt.

## PDF page 4

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
4
4. Flow: screens, requirements and comparison
Buyer screens: prompt conversation -> plain-language confirmation -> progress -> comparison/evidence ->
final quote -> result. The main input is a prompt, not a specification form. Preserve the request on reload. Show
"Demo merchants and inventory; no real purchase" and evidence/payment mode badges. Merchant screens:
own catalog, policy controls, pause toggle, own bids/rejections and permitted council events.
1. Establish an anonymous session and accept a prompt up to 4,000 characters: e.g., "I need a quiet kettle for
a small apartment, under $60 delivered by Friday." A neutral intake agent extracts explicit needs and proposes
interpretations. Merchant agents later map the same confirmed brief to their own catalogs; they do not privately
redefine it.
2. Ask only material follow-ups in chat, at most three grouped turns. Show a short editable summary/chips:
category, quantity, deadline, region, conditions, must-haves, preferences and price disclosure.
Budget/deadline start unset; quantity one/profile condition defaults are visible. Do not require the buyer to know
technical parameters. Optional advanced details are available. If ambiguity remains, save a draft and explain
what needs an answer.
3. The buyer confirms the interpreted brief and private all-in maximum. An optional target is shared only with
explicit permission. Persist a version; distribute a sanitized common brief, never the raw prompt containing
private prices or personal context. Show stages, elapsed time and actual merchant participation. Edits create a
new version; cancellation is allowed before execution.
4. Merchant agents inspect own inventory/policy, propose suitable products, permitted prices and
evidence-backed arguments. Neutral checks produce comparable fit explanations. Run a bounded council,
then one sealed final-price round only if useful. Research final 3-5 offers when available; show the true count
otherwise. Cards separate fit, delivered price, terms and sentiment.
5. Buyer inspects sources and chooses. Revalidate/reserve only the selected bundle; show a three-minute
server countdown, changed terms, and final approval. No inferred approval.
Conversational rules: "under $1,000" proposes a private ceiling; "around $1,000" needs clarification before
becoming a hard maximum. "Try for $950" is a proposed shared target, not permission to disclose it until
confirmed. A request for "quiet" or "good for college" remains a preference until grounded in supported facts.
The buyer can correct the summary in natural language; no merchant argument can silently change it.
No-match path: show the limiting requirements and allow a new prompt or explicitly approved relaxation.
Never invent sellers, consent, a stock commitment or a discount to keep the flow moving.
5. Category profiles and manufactured-product scope
Common constraints: category, brand/model if specified, quantities, condition, total ceiling, arrival, minimum
seller warranty/returns. Product constraints are typed entries: line ID, profile field ID, allowed operator,
value/unit, hard or soft. Pin the immutable profile version through validation/checkout; updates apply to new
requests. Profiles define labels, types, ranges, units, operators, clarification, variant identity, compatibility and
evidence scope. Models propose values; server validators enforce them.
Profile
Launch-specific rules
Laptop / tech accessory
OS, RAM/storage GB, weight grams, USB-C charging; refurbished battery-health
percent; explicit supported-device compatibility.

## PDF page 5

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
5
Profile
Launch-specific rules
Clothing
Garment type, brand-specific size label/system, color, material percentages,
garment measurements in mm. No universal M-to-M equivalence; fit preference
is advisory. Default new only.
Household accessory
Item type, dimensions mm, material, color, mounting/interface compatibility. Do
not infer load capacity or attachment safety. Default new only.
Small appliance
Type, dimensions mm, capacity with named unit, voltage V/frequency Hz and
plug/region. Compare measured noise/energy only with units and test basis.
Default new/refurbished.
Operators: equals/in/min/max/containsAll, allowed per field; convert compatible units before comparing. Reject
unknown fields/operators or contradictory bounds. Unknown hard facts fail; subjective claims such as
"flattering" remain preferences. New profiles are operator-reviewed configuration, never generated executable
rules.
Store UTC milliseconds; show America/Los_Angeles. Date-only means 23:59:59 local, confirmed explicitly;
reject past dates. Demo arrival = quote time plus configured calendar days. No street address/card data. UI
must support keyboard use, readable status announcements and preserved focus.
Extending coverage: add an operator-reviewed profile, typed attributes, permitted conditions, variant keys,
compatibility checks, source applicability rules and positive/negative fixtures. Expose the new profile through
the existing prompt flow. Do not add a new negotiation or checkout engine. Generic descriptions can be drafted
for any manufactured product; verified matching requires supported fields and actual inventory.
Constraint provenance: each extracted requirement records the source message span, whether explicit or
proposed, and buyer confirmation. A merchant may infer useful candidates from the use case but must label
assumptions, never present them as buyer requirements. Conditions such as refurbished battery health apply
only to relevant categories.
6. Catalog, mock commerce and seed requirements
Identity: Product = family/model; Variant = exact configuration, size/color/material or regional version; Listing =
merchant's stock/condition/terms for that variant. Manufacturer part number/GTIN is optional and never
invented. Include category/profile version and per-attribute provenance: manufacturer, real report or synthetic
demo. Stock belongs to listings, not families.
Laptop pitch fixtures: internal IDs, not manufacturer part numbers. Sources establish specifications, never
stock. [S7-S10]
ID
Canonical configuration
Source
P1
MacBook Air M2 2022; 8-core CPU/8-core GPU; 16 GB/512 GB
Apple US M2 [S7]
P2
MacBook Air 13-inch M3 2024; 8-core CPU/8-core GPU; 16 GB/512 GB
Apple US M3 [S8]
P3
MacBook Air 13-inch M4 2025; 10-core CPU/8-core GPU; 16 GB/512 GB
Apple US M4 [S9]
P4
Same M4 family; 10-core CPU/10-core GPU; 24 GB/512 GB
Separate configuration [S9]
P5
ThinkPad T14 Gen 5 Intel; Core Ultra 5 125U; 16 GB/512 GB; Windows 11 Pro
English
US model 21ML0053US;
withdrawn status does not
imply current stock [S10]
P6
MacBook Air M2 2022; 8-core CPU/8-core GPU; 8 GB/256 GB
Low-spec fixture [S7]

## PDF page 6

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
6
Retain source/checked date. Unknown attributes stay null. Apple OS family is macOS; no unsupported
OS-version, weight or benchmark claims.
Fixed commercial fixtures
Fictional USD dollars; store cents. N=new, R=refurbished. Entry = product / condition / quantity / list / floor.
Merchant
Laptop listings
All-category demo policy
Demo
Merchant A
P1/R/1/620/580; P3/N/2/990/950; P5/R/1/690/650;
P6/R/1/480/450
Shipping 15; arrival +3 calendar days;
12-month demo seller warranty; 14-day
returns.
Demo
Merchant B
P2/R/1/750/710; P3/N/1/1020/965; P5/N/1/850/810;
P6/N/2/550/520
Shipping 0; arrival +1 day; 24-month demo
seller warranty; 30-day returns.
Demo
Merchant C
P1/R/1/610/610; P4/N/1/1090/1090; P5/R/1/680/680;
P6/R/1/460/460
Shipping 0; arrival +2 days; 12-month demo
seller warranty; 14-day returns. No price
concession.
Refurbished listings are unique units. Synthetic health: A/P1=92%, A/P5=90%, B/P2=88%, C/P5=85%; others
unknown. These are not certified diagnostics. Unknown fails a mandatory health threshold.
Each merchant: ten fictional mice at list 25, ten USB-C-to-USB-A data hubs at 35; A/B floors 23/32, C floors
equal list. Simulated P1-P6 compatibility only; no charging/display claims. Included charger is a demo condition
flag.
Required non-tech fixtures
All below are fictional brands/products with synthetic attributes, not web-reviewed real items. Each merchant
stocks five new units of every variant; A/B floors = 90% of list, C floors = list. Same policy table applies.
Reviews show unavailable. Replace/add a genuine identified non-tech item for the real-source smoke test;
never relabel these fixtures as real.
Variants
Typed attributes and USD list prices
C1 / C2: Demo Tee
Brand DemoWear; size system Demo US unisex; navy. C1: M, cotton 100%, garment chest
circumference 1000 mm/length 700 mm, 25. C2: L, cotton 60%/polyester 40%, 1080/730 mm,
30.
H1 / H2: Demo Shelf
Wood, white, freestanding. H1: width/depth/height 500/300/600 mm, 80. H2: 800/400/800 mm,
100. No load-rating assertion.
A1 / A2: Demo Kettle
1.5 L, 220/160/230 mm. A1: 120 V/60 Hz, NEMA 1-15 US plug, 45. A2: 230 V/50 Hz, CEE 7/16
plug, 40. No safety certification asserted.
A/B maximum item discount is 10%; C permits 0%. The effective floor can be stricter than that cap. For demo
contribution accounting, per-unit synthetic cost = 80% of list and required minimum contribution = 5% of list;
shipping cost equals the shipping charge. These assumptions are not retailer benchmarks.
All prices are tax-inclusive fictional prices: tax line zero, "included in demo price." Total = sum(quantity x
permitted unit price) + shipping once per bundle. No fee/cross-line discount. Agents choose floor-to-list prices;
warranty/returns/shipping remain policy constants.

## PDF page 7

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
7
7. Agent roles, offer contract and compute policy
One internal Gemini context per merchant; server binds scope before tool calls. Validate arguments and
structured final output. Preserve SDK function-call identity/signature parts. No recursive agents, arbitrary
browsing, shell access, or model-selected merchant identity. [S3]
Role
Allowed operations
Cannot do
Intake
Propose fields, clarify, explain confirmed request
Confirm requirements or purchase for the
user.
Merchant
searchOwnCatalog, readOwnInventory/Policy,
readApprovedSpecs, evaluateOwnPrice, proposeOffer,
respondToChallenge, reviseOffer, abstain
Edit stock/policies; see ceiling/rival floors;
reserve/pay.
Moderator
Read shared requirements/permitted claims; challenge;
classify supported/contradicted/unknown
Purchase, alter hard constraints, rank
rhetoric, view floors.
Evidence
Extract allowlisted sources, assess applicability, attach
claims
Change prices, stock, permissions or
approval.
Offer: request/run/version; listing IDs/quantities; integer unit prices; policy/inventory versions; claim/source
IDs; proposed fit explanation; private contribution/strategy assumptions; reason or abstention. Self-assigned
scores never become authoritative buyer scores. Server recomputes total, arrival and terms, validates
constraints and persists immutable accepted versions. One repair after rejection within caps, otherwise
abstain. Private-constraint rejection is generic to sellers; no budget headroom.
Events: event ID, request/version, run ID, round, server-bound role/merchant, offer version, type, timestamp.
Types: proposal, accepted, rejected, challenge, response, revision, price_round_opened, final_bid,
price_round_skipped, abstained, closed. Challenge names a claim/concession. Responses cite approved
sources or admit uncertainty; changed goods/prices require a validated new offer version.
Compute policy
Default one round: claims arrive with bids; moderator asks at most one targeted question per merchant; each
answers and may correct its product/claim once; moderator summarizes changes. Buyer gets a summary and
optional claim/tool-outcome transcript, not hidden reasoning. Skip council with fewer than two qualifying
merchants.
Allow one additional council round only for a named material issue, a specific new tool result able to resolve it,
and time/call/quota headroom. It is a verification round, not another price auction. The separately gated
final-price round has at most one submission per candidate. Log trigger. Stop on resolution, no material
change, two rounds, cancellation or a limit. Prefer extra compute for relevant evidence checks over repeated
persuasion. Defaults are not a proven cost-quality optimum.
Server-configurable caps: three concurrent merchants; two active candidate offers each, with immutable
revisions; three tool/model cycles per initial agent; 28 model calls/run including final-price work; 36 only with
the extra verification round; 40 tool calls/run; 8,192 output tokens/response; 75-second matching/council,
30-second final-price window, 60-second research, 210-second overall run. Intake is outside the run but
capped at three grouped clarifications. One transient retry counts toward caps. Track tokens, elapsed time and
provider cost when available. Operator sets provider spending limits before public use; stop on configured
quota exhaustion. No promised hard dollar cap without provider support.
Start with gemini-3.6-flash, medium thinking; model/limits are backend settings. Truncated/invalid JSON is
rejected. Increase caps only through configuration after measuring cold/warm runs; extra compute cannot
bypass policy, identity, approval or time guards.

## PDF page 8

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
8
8. Merchant incentives and variable-price policy
Think of a merchant choosing whether to offer a small negotiated concession to win a particular customer. The
goal is a profitable completed sale, not the deepest possible discount. A suitable item may win at list price
through fit, availability, warranty or delivery.
Merchant objective: expected contribution = estimated probability of winning and completing the sale x
contribution if sold, less incremental quotation/agent cost. Contribution includes goods cost, fulfillment,
payment/platform costs and an allowance for expected after-sales expense where provided. It is not revenue
and is not full accounting profit.
The demo has no historical win/conversion data. Agent-estimated probabilities and synthetic costs must be
labeled assumptions; do not claim calibrated predictions, truthful equilibrium or a globally optimal price. Record
considered prices, margin checks and the strategic rationale privately. An agent can hold price or abstain.
Enforceable pricing contract
Per listing: reference/list price snapshot, operator floor, maximum discount in basis points (1,000 bps = 10%),
provided/synthetic unit cost and minimum contribution. Effective minimum unit price is the maximum of:
operator floor; reference price x (1 - discount cap), rounded upward to cents; and unit cost + required minimum
contribution. A reference price must be a legitimate current baseline; do not inflate it to manufacture savings.
The agent may propose prices between effective floor and reference price. The server validates cents,
quantities, current policy and complete delivered total. Shipping/returns/warranty remain the demo constants;
no hidden fee can recover a nominal discount. Policy caps are per product/merchant, never inferred by the
model. A/B seed caps are 10%; C is 0%; existing higher operator floors remain binding.
Important economic limit: with a $1,000 selling price and $900 relevant cost, contribution is $100. A 5% price
cut leaves $50; 10% leaves zero, before any omitted cost. Thus 5-10% can be material. Do not promise every
category can afford it. The synthetic seed cost assumptions are demonstration inputs, not estimates of laptop
or clothing margins.
Price disclosure and fairness
• Private maximum: the platform checks affordability without inserting it into merchant prompts or pricing tools.

• Optional shared target: a buyer can explicitly authorize "try for $950." It informs negotiation but is not a
 promise to buy or permission to charge that amount automatically.
• No inferred wealth/profile pricing: do not use browsing history, identity, demographics or the private ceiling to
 estimate willingness to pay. The original prompt is private; merchant context is a sanitized projection.
• Different quotes can follow different times, stock, permitted competition or explicit targets. Explain the
 mechanism. Do not claim identical buyers always receive identical prices, or that stating a true budget is a
dominant strategy.
The FTC's study describes personal-data-driven individualized pricing; it is context for the trust design, not a
finding about this prototype or a legal conclusion. [R5]
Why join: qualified incremental demand, less quotation work, selective concessions, suitable stock movement
and competition on service. These are hypotheses to test after fees/returns. Subscription tools or a transparent
completed-order fee are possible later; the demo charges no fee. Paid placement cannot influence neutral fit or
undisclosed ranking.

## PDF page 9

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
9
9. Bidding mechanism and council sequence
Recommended mechanism: private initial quotations, a bounded claim council and an optional sealed
final-price round. The buyer chooses a final offer and pays its quoted amount in the demo/supported sandbox
flow. Because goods and terms differ and the buyer retains choice, this is a competitive quotation marketplace,
not a textbook auction with guaranteed truthful revelation. Reverse-auction theory is a useful reference, not a
proof of optimal outcomes here. [R6]
1. Freeze the common confirmed requirements, profile versions and disclosed target. Invite three matching
demo merchants. Give equal material clarification; private floors, costs, ceilings and raw personal prompts stay
scoped.
2. Each merchant independently searches its stock, checks policy, creates up to two candidates, evaluates
permitted prices and submits its initial product/price/fit case. Validate technical/commercial facts. Keep
policy-valid but over-budget candidates internal and nonselectable: a concession may later make them
affordable.
3. The moderator challenges at most one material claim per merchant. Responses cite approved
specifications/evidence or concede uncertainty. A correction creates a new version. Debate cannot vote a false
hard fact into eligibility. Web research at the end remains independent of this merchant advocacy.
4. The coordinator decides whether final repricing adds value. Require at least two actual independent
policy-valid merchants, and either a permitted price change can improve the price order within an equal-fit tier,
the buyer requested negotiation, or no current price is affordable but a merchant's permitted floor could be. Log
the gate without exposing private ceilings. Otherwise skip.
5. Each participating merchant receives its own validated case and limited truthful feedback: e.g., "your
delivered price trails a comparable offer." Do not share rival floors, costs, identity-private strategy or future
submissions. Compare equivalent variants/condition/terms where possible; identify material differences rather
than pretending all offers are identical.
6. Open a server deadline, at most 30 seconds and inside total run limits. Each candidate has at most one final
commercial submission. Store revisions privately until close. Accept lower delivered prices or unchanged
prices with expressly permitted improvements; reject price increases, silent reductions in value, or policy
violations. Product substitutions are visible and revalidated.
7. Close on the deadline or once all responses arrive. A merchant can hold or abstain; absent/invalid revisions
retain its latest valid offer. No endless penny undercutting or reopening because a merchant loses. Revalidate,
score, research the shortlist and present actual outcomes.
One-seller case: skip the competitive auction narrative. If the buyer explicitly requested a target, permit one
policy-bound counteroffer labeled single-seller negotiation; never invent a rival. No eligible stock/floor means
an honest no-match, not pressure to break policy.
Commercial revision safety: bind round, request/candidate/policy versions and server merchant scope.
Logical submission keys deduplicate retries; mismatched replay fails. A completed price round cannot accept
late bids. More council compute is for unresolved verification, not extra commercial rounds. If the coordinator
fails, return safe current offers with a partial/round-skipped state.
Merchant intelligence: the agent should compare contribution at candidate prices, consider whether another
concession plausibly changes its chance of selection, and explain why it stopped. evaluateOwnPrice returns
deterministic contribution/floor checks; any win-likelihood estimate is an explicitly unvalidated assumption. The
server enforces authority even when a model's strategy is poor.

## PDF page 10

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
10
Worked mock run
Buyer prompt: "I need a new MacBook Air with at least 16 GB memory and 512 GB storage, delivered in San
Francisco within five days, under $1,000 total." The assistant confirms that $1,000 is private, quantity one, no
extras and no additional soft preferences. These proposed prices are an illustrative trace, not guaranteed
agent outputs.
Merchant
Initial -> final delivered offer
Validation and meaning
A / P3
$980 item + $15 shipping = $995 -> $960 + $15 = $975
Final unit price exceeds its $950 floor and
stays inside its 10% cap. $20 improvement
from initial delivered offer.
B / P3
$1,000 with free shipping -> $970
Above its $965 floor; $30 initial-to-final
improvement. Final item discount against
$1,020 list is about 4.90%.
C / P4
$1,090 -> holds $1,090
Policy permits no discount. It remains
nonselectable under the private ceiling,
despite its higher-memory variant. No
fictitious concession.
With no scored preferences, B sorts before A by final delivered price; buyer still chooses. Research P3 once for
both sellers, not as two independent product populations. P4 owner evidence is unnecessary if it cannot
qualify. Merchant warranty/returns stay separate from product reviews. Selection revalidates and holds the
chosen listing before approval; the trace ends with labeled simulated execution.
A non-tech check uses "navy DemoWear M, 100% cotton": C1 can match, C2 cannot. The same commercial
engine runs, but the fictional shirt has unavailable owner sentiment; never attach a real brand's reviews to it.
10. Neutral fit assessment, arguments and shortlist ranking
The merchant makes the sales case; the platform checks it. A seller's "95/100 fit" is a claim, not a ranking
input. The buyer sees both the merchant's argument and an independently calculated requirement breakdown.
Hard eligibility first: category/variant/condition, quantities, compatibility, required properties, delivery,
commercial authority and private all-in ceiling must pass. Unknown hard facts fail. Policy-valid over-budget
proposals can negotiate internally but never appear as selectable qualifying results. A great review score
cannot compensate for the wrong size or a missed deadline.
Default measurable preference coverage: for each confirmed soft preference that uses a supported typed
comparator, match=1 if supported and satisfied, otherwise 0. Use weight 1 unless the buyer confirms a top
priority, weight 2. Coverage = 100 x sum(weight x match) / sum(weights). Show matched, unmet and unknown
components; an unknown contributes zero and retains its label. With no scorable soft preferences, show no
numeric fit score. This is preference coverage, not a probability of satisfaction or an objective quality score.
Subjective language such as "stylish" is explained qualitatively until grounded in a supported preference. The
intake assistant proposes priorities in ordinary language; the buyer confirms them. Do not invent weights from
a hidden personality profile. Confirmed scoring/profile versions are fixed for the run.
Default order, a v4 change: Best fit. With F=coverage descending, P=delivered cents ascending, D=arrival
ascending, W=warranty descending and I=stable offer ID ascending, exact keys are Best fit (F,P,D,W,I),
Cheapest (P,F,D,W,I), Soonest (D,F,P,W,I), Warranty (W,F,P,D,I). When no score is defined, omit F.
Implement these keys in shared server code, never generated prose.
Shortlist: maximum two active candidates/merchant. Accepted revisions supersede their parent; history
remains. Take the best qualifying offer from each participating merchant, fill remaining positions by selected

## PDF page 11

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
11
order, maximum five, then display that shortlist in the selected order. Explain diversity selection; do not imply
these are necessarily the five cheapest offers in the entire pool. Same variant from two merchants is allowed
and labeled.
Evidence consequences: sentiment itself is advisory. An applicable authoritative fact can invalidate a hard
requirement or update a supported field; revalidate/rescore rather than silently editing the merchant snapshot.
Research a replacement reserve identity once, at most one refill pass and five primary identities total. Do not
silently relax requirements, restart bidding or recycle stale claims.
Card explanation: "Meets all 6 required checks; 2 of 3 supported preferences matched, one unknown.
Merchant argues the longer warranty justifies $20 more. Owner reports are mixed on fan noise." Each factual
fragment must reference a validated attribute, commercial term or evidence record. These labels must remain
separable.
No automatic winner: the buyer may choose another qualifying offer. Only exact selected terms, a valid
reservation and explicit approval authorize execution. The system must not auto-buy because a fit score or
negotiated price crosses a threshold.
11. Real evidence and final validation
Research distinct finalist product variants after bidding, regardless of category. Merchant-selected sources are
inputs, not the neutral corpus. Independently acquire manufacturer/brand facts and owner/test reports.
Preflight laptops plus one non-tech product. Never fabricate quotes or transfer reviews from an unrelated
product to a fictional item.
Acquisition: start an Apify Actor asynchronously; persist run ID/input digest; poll server-side at 2, 5, 10, then
10-second intervals. Verify expected run/status before reading its dataset. Webhooks can wake polling but
cannot supply trusted dataset IDs or approval. Abort overdue runs where supported; late data is stale research,
never advancing an obsolete request. [S4]
Bounds: eight URLs/forty excerpts per primary product variant; five primary variants including refill. Related
lines use existing evidence or show not researched; do not imply full bundle coverage. Allowlisted HTTPS
sources; no private-network URLs or buyer crawl targets. Deduplicate URL/content/source family. Reuse
matching real evidence within 24 hours with timestamp. Cache never establishes stock, price or unit condition.
Pin Actor build/input schema. [S4]
Applicability
Can support
Cannot establish
Family/model
Related owner themes and family
capabilities
Exact size, material, configuration,
region or unit health.
Exact variant
Explicit attributes and applicable tested
performance
Another variant's fit/results or current
unit condition.
Demo unit/listing
Synthetic diagnostic, stock, price and terms
Real ownership, certified refurbishment
or real availability.
Evidence record: identity/applicability, URL/source ID, type, source date or unknown, retrieval time, short
supporting excerpt, claim, Actor/run/build, duplicate group, ownership-label provenance and verification state.
Display brief quotations and source links; minimize personal identifiers. Purge/anonymize completed
research/requests after seven days; retain unresolved approval/execution/allocation records until
reconciliation, then apply retention. No raw full-page retention by default. A demo reset cannot erase
unresolved sandbox-attempt evidence.

## PDF page 12

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
12
Display: separate neutral fit, merchant sales argument, commercial offer, independent tests, owner reports
and demo condition. Show positives, concerns, disagreement, count, freshness and gaps. A claimed owner is
not independently verified; attribute site verified-purchase labels to that site. No artificial consensus probability,
fake sentiment average or guarantee.
States: pending, complete, partial, unavailable, cached. Manufacturer-only says "owner evidence unavailable."
Blocked/empty sources can use a previously collected real snapshot with original timestamp and cached label;
otherwise show unavailable and source links. Advisory evidence failure does not prevent selection of a fully
validated demo offer. Unknown mandatory facts still block eligibility.
Category caveats: clothing fit reports retain purchased size/measurement context; appliance performance
retains region/test basis; household compatibility requires exact dimensions/interface. Mixed-variant reviews
stay family-level. Product reviews cannot prove a refurbished unit's condition, seller reliability or counterfeit
status.
Contradictions: authoritative facts failing a hard constraint invalidate the offer and trigger bounded refill.
Conflicting authoritative facts exclude offers dependent on them until reviewed; a lone allegation/model
summary cannot overwrite specs. Web text cannot grant permissions, alter policy, expose secrets or pay.
Effect on the decision: sentiment supplies contextual positives/concerns with citations; it does not silently
change the fit formula. A new authoritative fact can invalidate a hard constraint or update a supported soft field,
triggering revalidation/rescoring. Do not reopen price bargaining because a merchant dislikes the evidence.
After finalization, a better offer requires a new run and renewed buyer consent.
12. Data, function surface and permissions
Shared runtime-validated TypeScript contracts drive Convex, test fixtures and UI; no parallel handwritten
payload definitions. Opaque IDs, integer USD cents, line quantities 1-10, UTC milliseconds; immutable records
carry createdAt/schemaVersion. Pass IDs between steps; store source output separately.
Record
Minimum contract
Merchant / membership
demo=true, enabled, name; server-owned userId -> merchantId.
CategoryProfile / Product / Variant
Versioned typed fields/operators/units, clarification/compatibility/evidence rules;
family identity; exact variant attributes and provenance. Unknown manufacturer
IDs remain null.
Listing
Variant ID; merchant, condition/unit ID, quantity, list/floor, diagnostics, included
items, version. Never collapse all sizes/colors into one stock bucket.
Policy / PricingPolicy
Merchant/version, allowed concessions, reference price, discount cap bps,
operator floor, synthetic or provided cost and minimum contribution,
shipping/terms, effective time. Private cost fields never enter buyer views.
RequestVersion / Run
Owner, raw prompt/requirement provenance, confirmed constraints, private
ceiling, optional consented shared target, priorities/sort, profile versions; stage,
budgets, deadline, config and latest run ID.
OfferVersion / CouncilEvent
Request/run/merchant/version, immutable lines/snapshots, terms/expiry;
policyValid, requirementsValidExceptBudget, affordable, selectable and reasons;
claim/source/event refs. Selectable requires all checks, current version/terms and
no unresolved hard fact.
FitAssessment / AuctionRound
Versioned score breakdown/coverage; round mode, participant snapshot,
deadline, per-candidate final submission key, feedback projection and close
reason.

## PDF page 13

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
13
Record
Minimum contract
ResearchJob / Evidence
Identity/input digest, expected provider run/build, status; provenance/applicability.
FirmQuote / Reservation
Request/offer versions, commercial snapshot, hash, expiry; listing allocations,
owner, active/locked/released/sold.
Approval / Execution / Order
Quote hash, owner/time, attempt key, mode, operation, result/unknown, receipt,
mock fulfillment label.
ProcessedEvent / Audit
Logical key, payload digest/prior result; timestamps, rejections, token/cost status;
no secrets/private prompts.
Public functions: authenticated and scoped
• saveDraft/confirmRequest/reviseRequest: owner; validate fields; confirmed revision immutable. Changes
 cancel obsolete jobs/nonlocked holds; executing requests cannot change.
• startRun/cancelRun/getBuyerView: owner; one active run/request, three active requests/session, five
 starts/minute. Reload resumes stored progress.
• getMerchantView/updateOwnListing/publishOwnPolicy/pauseOwnMerchant: server membership. Stock edits
 cannot erase sold/held allocation. Pause blocks new bids/selections, not locked-attempt reconciliation.
• getBuyerView includes only safe score/claim/auction summaries. selectAndReserve: owner/current
 offer/version; transactional recheck/hold. approveAndExecute: owner/exact quote hash/unexpired
hold/idempotency key.
Internal only: dispatchAgent, validateAndStoreOffer, assessFit, openPriceRound, submitFinalBid,
finishResearch, closeRound, expireHolds, executeAdapter, reconcileExecution and resetDemo. Model
merchantId grants nothing. Same key + same payload returns prior result; mismatched replay fails. Every
completion checks active version, expected stage/run and transition.
Auth: Convex Auth Anonymous for buyers, Password for privately provisioned operators. Create three
accounts, grant memberships internally, then reject password signUp server-side. Never trust browser
role/email fields. Buyers read own runs; merchants read own policies/bids and permitted council projection,
never ceiling/rival floors. Separate buyer/operator browser contexts. Guest cross-device recovery is out of
scope. [S2]
Errors: code, safe message, retryable, correlationId. Codes: INVALID_INPUT, FORBIDDEN,
STALE_VERSION, NO_MATCH, POLICY_REJECTED, EXPIRED, STOCK_UNAVAILABLE,
PROVIDER_UNAVAILABLE, LIMIT_REACHED, EXECUTION_UNKNOWN. Seller errors omit private values.
Operator changes invalidate unapproved stale quotes; an executing approved snapshot completes under its
frozen terms.
Budget/target cents must be positive safe integers; a shared target cannot exceed the confirmed maximum.
Discount bps are integers 0-10,000, with stricter configured caps. Price-round eligibility requires policyValid
and requirementsValidExceptBudget, not selectable; otherwise an initially unaffordable candidate could never
negotiate into range. Feedback is bounded, not a claim of preventing every inference about hidden limits.
13. Lifecycle, reservations and execution safety
Request: draft -> bidding -> council -> negotiating (optional) -> researching -> results -> reserved -> executing
-> complete. Alternatives: no_match, cancelled, failed. Partial/unavailable evidence annotates results. Persist
state; browser/model memory is not authoritative.

## PDF page 14

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
14
On stage/overall deadline, close outstanding jobs. Continue with already validated offers and truthful partial
evidence; if none exist, use no_match for confirmed inventory mismatch or retryable failed for provider failure.
Late completions cannot reopen the run. Never manufacture agent output when generation failed.
Transition
Guard and outcome
Confirm/start
Owner confirms required fields; create version/run; schedule workflow. Edit
invalidates old work and releases active nonlocked holds.
Bids -> results
Validate current offers; apply council and optional sealed final bids; freeze current
comparison pool; research/refill within limits.
Select -> reserved
Recompute current policy/listing; reject paused/unavailable/noncompliant;
atomically create immutable firm quote and allocations.
Approve -> executing
Check owner/hash/versions/server time; create one approval/attempt and set
execution_locked before provider calls.
Success
Convert locked allocations to demo sold exactly once; save truthful mode-specific
receipt.
Definite decline/failure
Record terminal attempt; release once; return buyer to selection. Unknown is not
a definite failure.
Timers: offer validity starts at each accepted version, 15 minutes; final-price deadline is server-owned, at most
30 seconds and within the run budget; no hold during research. Expired selection requires full revalidation, not
automatic rejection forever: issue a renewed firm quote and display any changed terms. Firm quote/hold valid
three minutes; server checks time even if cleanup is late. Successful replacement atomically releases old hold;
failed replacement keeps the old valid hold.
Available = initial quantity minus sold and unexpired active or execution-locked allocations. Expired active
holds do not count even before cleanup. Unique refurbished units have quantity one. Release/expiry/sale is
idempotent. Never release an execution lock just because its former three-minute hold elapsed.
Payment adapter and truthful results
Default PAYMENT_MODE=simulation. No real card collection/live-money capability. Adapter input is server
execution ID + approved quote; output is succeeded, declined, pending or unknown, actual operation and
provider reference. Privileged simulation fixtures: success, declined, unknown_then_success. Success says
"Demo order completed; no payment taken"; delivery remains fictional.
Enable Visa sandbox only after exact API/test mapping, amount/merchant semantics, duplicate protection and
status lookup pass a smoke test. Disclose test-merchant mapping. An unrelated fixed test amount is not proof
the chosen quote was paid. Tokenization-only says "Visa sandbox credential test"; order completion stays
explicitly simulated. No invented endpoints/settlement claims. [S5]
Timeout -> EXECUTION_UNKNOWN with allocation lock retained. Reconcile the same attempt/reference;
block another purchase for that request until resolved. If safe status/idempotency handling is unavailable,
disable that external path and use simulation. Disable cancellation/edits during executing/unknown. Internal
demo reset labels fictional-state reset; it cannot imply a provider refund.
A final-price timeout retains the latest valid initial/corrected offer for merchants that did not improve; it does not
fabricate a concession. Expired or invalid offers remain nonselectable. Frozen comparison snapshots
distinguish initial, revised and final terms.

## PDF page 15

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
15
14. Implementation Plan: architecture and setup
Runtime: React/Vite SPA -> Convex functions/Workflow -> Gemini actions and Apify jobs -> stored results ->
approved quote -> adapter. Vultr serves built SPA over HTTPS with client-route fallback. Convex hosts
backend; Apify hosts extraction. No permanent extra worker. [S1, S4]
Convex mutations own state/stock transactions; actions own external calls; Workflow persists
orchestration/retries. Use official @google/genai behind an adapter, pin SDK/lockfile and preserve function-call
parts. Source registry pins Actor builds/input mappings. Optional Product Evidence Pack Actor normalizes
existing crawlers; no new crawler required. No network inside transactions. [S1-S4]
Configuration
Browser: public VITE_CONVEX_URL/demo labels only; VITE variables are public. Backend:
GEMINI_API_KEY, GEMINI_MODEL, APIFY_TOKEN, source registry, PAYMENT_MODE, optional Visa test
credentials/mapping and Auth signing settings. Server constants own limits/TTLs/region. Keep credentials and
provisioning gates out of client/public source. [S1-S4]
Start from the official Convex React/Vite + Auth scaffold. Seed catalog/policies and privately provision
operators; disable public password signup. Default inventory mode is mock. Never assume credits or generate
credentials in source.
Release sequence
1. Freeze contracts/profile definitions and Figma states; seed fixtures/auth; prove owner and merchant
isolation.
2. Test real Gemini tools and Apify sources for a laptop and non-tech item; pin working versions. Failures
become honest cache/unavailable states.
3. Connect one full offer -> hold -> approval -> simulation path, then council/evidence/refill; exercise each
category without a backend fork.
4. Configure deployment Auth/Convex separately; build dist for HTTPS Vultr hosting with index.html fallback.
Vite preview is not production. Test nested refresh/fresh sessions.
5. Run acceptance cases, gated Visa test and submission proof. No deployment/spend/publication performed
by this planning task.
Use the laptop pitch plus a short non-tech run; clearly distinguish synthetic fixtures, live/cached evidence and
simulation.
Module boundaries: shared contracts/category profiles; buyer intake/projection; merchant inventory/policy;
scoped agent adapter; pricing evaluator/auction coordinator; fit validator; evidence identity/acquisition;
reservation/execution; safe UI queries. External services sit behind adapters so deterministic fixtures can test
orchestration without pretending that fixture output came from a real model or crawl.
15. Figma design, prompt UX and frontend handoff
Two teammates own Figma design and the UI handoff. A owns buyer intake, requirements, progress,
comparison/evidence and checkout/result; B owns merchant catalog/policy, bid/council views and shared
components. This ownership split is a proposed working default. Figma work must become a connected
frontend; a clickable design alone does not execute the marketplace.
Freeze the shared contracts first: CategoryProfile, RequestDraft, BuyerRunView, OfferCard, EvidencePanel,
FirmQuote, ExecutionView, MerchantView and ApiError, with schema-defined permission-safe fields. Backend
owns totals, eligibility, rank, timestamps, modes and allowedActions; UI renders them. The prompt is the

## PDF page 16

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
16
primary input; profile fields drive assistant clarification, optional detail chips and comparison rows, never a
mandatory specification form or laptop-only columns. Fixture payloads cover all four category families. Figma
may supply components/tokens; server data remains authoritative.
Design/handoff must cover responsive layouts, keyboard/focus, form validation, extraction ambiguity,
target-sharing consent, matching/council/repricing progress, loading/empty/error, stale offers, partial evidence,
expired hold, payment pending/unknown and success/decline. Persist IDs across reload; use subscriptions for
progress. Council detail shows claims/outcomes, not private reasoning. A/B own frontend wiring by default,
C/D supply tested contracts and adapters; no unassigned conversion from design to code.
Figma tracks: supplied and current event listings include Best Use Case of Figma, Best Design, Most
Creative, plus two Figma Agent categories. Preserve the design file, prototype, iterations and live
implementation evidence. Agent categories require actual demonstrated Agent use and rule confirmation;
ordinary Figma use does not establish that. Figma is a development/design track, not an added runtime
dependency. [S6]
Buyer-facing language: use "Tell us what you need," "Here is what we understood," "Merchants are
preparing offers," "An offer improved by $X," and "What owners report." Do not surface SDK names, model
internals or policy JSON in ordinary shopping screens. A separate operator/debug view may show validated
tool outcomes.
Required card content: exact product/variant/condition, neutral fit explanation and coverage, merchant
argument, initial/final delivered total and true discount basis, delivery, warranty/returns, source-backed
sentiment/gaps, expiry and selection action. Only show "best price" or "best fit" when its published comparison
rule supports the label.

## PDF page 17

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
17
16. Sponsor strategy: core targets and listed prizes
Use technologies because they perform real project work, then claim only the tracks supported by evidence.
The prize values below are transcribed from the supplied event snapshot; the current official event page was
checked. Some headings say cash while descriptions name hardware/gift cards. Report both where they
conflict; do not sum them into expected winnings. Entry caps, award stacking and full sponsor rules remain
unconfirmed. [S6]
Target track
Listed prize
Meaningful role and proof to preserve
[Visa] Best use of Reimagining
Shopping sponsored by Visa
$5,000 heading
Primary narrative: consumer intent becomes merchant
competition, explainable offers and approved checkout.
Show every rubric dimension; attempt actual sandbox
operation, accurately label simulation. API
mandate/access not established from listing.
[Apify] 1st/2nd/3rd/4th/5th Place
Best use of Apify
$2,000 / $1,000 / $800 /
$400 / $400 headings
Real final-product evidence acquisition and normalization.
Preserve Actor/run IDs, source provenance and the
working extraction path. Places are alternatives within one
competition, not five separate integrations.
[Apify] Best Actor sponsored by
Apify
$400 heading
Conditional extension: reusable Product Evidence Pack
Actor consumes source inputs and emits identity-matched
evidence. Confirm custom Actor/publication/separate
submission rules before claiming qualification.
[Convex] Best use of Convex
$1,308 heading;
description: Teenage
Engineering EP-133 K.O. II
plus Waveshare
ESP32-S3 touch display
Authoritative requests, isolated policies, bid versions,
sealed rounds, reactive progress and atomic mock
reservations. Demonstrate durable recovery and server
checks; simple database presence alone is a weak story.
[MLH] Best Use of Gemini API
MLH Swag Kits
Real Gemini API for prompt interpretation, merchant
strategies/arguments and bounded council/evidence
synthesis. Preserve working tool calls; fixtures alone do
not establish API use.
[MLH] Best Use of Vultr
M5Stack Official Tab5
Host the actual built frontend over HTTPS. Convex
remains backend; no fake extra worker needed. Preserve
hosting configuration and live endpoint. Credits/access
unconfirmed.
[Figma] Best Use Case of
Figma
$1,000 heading;
description: Amazon gift
cards and Early Career
Recruiting session
Core design effort by A/B: prompt confirmation,
cross-category comparison, evidence and merchant
controls. Preserve design/prototype/iterations plus
connected implementation. Exact judging proof remains to
confirm.
[Figma] Best Design; [Figma]
Most Creative
Each $1,000 heading;
same gift-card/session
descriptions
Candidate design categories for understandable
commercial negotiation and trustworthy comparison.
Confirm multiple Figma entries are allowed and
substantive criteria; no eligibility guarantee.
[Figma] Best Use Case of
Figma Agent; [Figma] Most
Creative Use Case of Figma
Agent
Each $1,000 heading;
same gift-card/session
descriptions
Conditional only if the teammates actually use and
demonstrate Figma Agent. Ordinary Figma design alone
is insufficient evidence of Agent use. Access/rules must
be confirmed.
Core stack logic: Gemini reasons; Convex enforces/coordinates; Apify acquires evidence; Visa anchors
responsible commerce; Figma shapes the experience; Vultr hosts the frontend. These roles complement each
other. Avoid duplicate agent frameworks or databases.

## PDF page 18

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
18
Submission evidence: save a short integration log for each claimed sponsor: feature, code/config location,
one reproducible demonstration, real-versus-simulated mode, account/source limitations and required links. Do
not claim that a logo, unused SDK or development assistant automatically satisfies a runtime-use track.
17. Sponsor strategy: conditional additions
These tracks have plausible uses but are not baseline dependencies. Prize details follow the supplied
snapshot; eligibility and access are unresolved. Add a track only after the complete core flow and acceptance
gates work. [S6]
Track
Listed prize
Fit, cost and decision
[Factory] Best Use of the
Factory Droid SDK
$2,000 cash, credits and
swag
A narrow merchant connector/normalization assistant
using the actual SDK could help later. Developer use
alone does not establish SDK integration. Deferred with
mock inventory; do not add a second autonomous council
harness.
[Cartesia] Best Use of Cartesia
$1,516 heading;
description Meta glasses,
TBD
Voice intake could complement the prompt for
accessibility, with editable transcript and written
confirmation. Deferred; narrated bidding adds little. Text
remains primary.
[Elastic] 1st/2nd Place Best use
of the Elastic Agent Builder on a
Serverless instance
$1,200 / $1,436 headings;
descriptions Meta Quest
3S / Bose QuietComfort
A specialist evidence/retrieval agent is useful at scale.
Named track requires Agent Builder on Serverless;
ordinary search is not proof. Deferred unless selected to
replace an existing research component.
[Creao AI] 1st Place Best
AI-First Disruptor; Best
One-Person Company; Best
Team Empowerment
Each $8,760 heading;
body $3,000 cash plus
CREAO subscription,
mentorship and other
opportunities
Merchant automation fits conceptually. Required CREAO
use/definitions unknown; avoid duplicating the core
platform for a headline prize. One-person business
beneficiary does not override hackathon team rules.
[Moss] Best Use of Moss
$996 heading; AirPods
Max/Pro description
Potential private catalog/evidence semantic retrieval.
Verify sponsor identity and exact rules first. Redundant for
a small typed catalog; not selected.
[Microsoft] 1st Place Built for the
Real World; 2nd Place Microsoft
Customer Impact Award
$3,800 / $0 headings;
Surface laptops,
presentation and
mentorship descriptions
Potential outcome fit, stronger with real merchant pilot. No
qualifying Microsoft product requirement established from
supplied copy; do not invent one or claim eligibility.
[Hyphenate] 1st/2nd/3rd Place
The Hyphenated Enterprise:
Autonomous Systems for
Finance
$8,000 / $5,000 / $3,000
cash; expedited interview
process for top five teams
described
Margin governance and reconciliation are adjacent, but
shopping debate alone is not an enterprise-finance
workflow. Deferred; do not pivot away from Visa for prize
size.
[Coinbase] Best Use of x402 by
Coinbase
$2,000 heading; body
$500 USDC/member/track,
two tracks/up to $4,000
total
An agent-paid metered evidence API is plausible later,
separate from buyer Visa checkout. Wallet funding adds
complexity. Unnamed second track must be clarified; no
invented category.
[Armadin] Best Security Hack
$996 heading; Apple
headphones, possible
hacking tools
Consider only with substantial adversarial security
evidence and confirmed brief. Having sensible
permissions does not by itself establish track qualification.

## PDF page 19

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
19
Track
Listed prize
Fit, cost and decision
[MLH] Best Domain Name from
GoDaddy Registry
Digital Gift Card
Low incremental work if an eligible relevant domain is
registered. Confirm route/suffix requirements; domain
purchase is not performed by this planning task.
[MLH] Commit Fellowship Prize
Category
Interview and The Lean
Startup
Potential continuation path for a working prototype and
real problem. Listed brief requires opt-in and
supplemental form. Not automatic fellowship acceptance.
Decision rule: one useful new capability, one bounded integration, demonstrable real use and no duplicated
source of truth. If it fails that rule or delays bidding/evidence/approval reliability, omit it from the submission
claims.

## PDF page 20

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
20
18. Sponsor strategy: alternatives, exclusions and discrepancies
Track / technology
Listed prize
Reason not selected
Fetch AI / [Fetch.ai] Best Use,
places 1-3
Devpost snapshot
$1,500/$1,000/$500;
sponsor hackpack
$1,250/$750/$500 plus
recognition prizes
User prefers own UI. Official pack requires Agentverse,
ACP, ASI:One discovery and the entire primary workflow
inside ASI:One, plus public runnable repo and additional
submission. Thus excluded under the confirmed UI
decision. Prize discrepancy is recorded, not silently
resolved. [S6]
Spacetime
No named track/amount in
supplied prize list
Official event blog announces a special prize but supplies
no amount here. It could replace Convex for shared
real-time state; adding it as a second authoritative
database is unjustified. Confirm actual brief before
reconsidering. [S11]
[Bitdeer AI] Best Use of Bitdeer
AI Model Studio, places 1-2
$500/$200 headings; body
credits and gaming
mice/LEGO
Alternative model hosting if genuinely needed; no
baseline reason for another provider. No track claim
without actual Model Studio use.
[MLH] Best Use of Snowflake
API
Arduino Student Kit
Alternative model/analytics platform. Current small demo
already has Gemini/Convex; no additional necessary role.
[MLH] Best Use of Tiger Data
Stream Deck Mini
Alternative primary database or meaningful later analytics.
Do not copy the same bid state into two backends for a
sponsor name.
[MLH] Best Use of Solana
Assorted prizes
No current decentralized requirement. Adding a token
transfer does not improve merchant pricing or evidence
reliability.
[Capital One] Best Use of
Nessie
$1,200 heading; $300
Giftogram/member
description
Mock banking could inform a budgeting extension but
cannot establish actual funds, reserve inventory or
execute Visa checkout. Redundant simulation now.
[CRS] Best Overall CRS Hack;
Best Financial AI Agent; Best
Identity / Fraud Innovation; Most
Unexpected Use of CRS
$1,000/$500 headings;
latter two interview
opportunities
Consumer credit/identity data does not prove product
quality or merchant stock. No credit pulls or financing
feature in the core shopping demo.
[Meta] Meta/Facebook: Bringing
People Closer Together with AI
Next-round invitation,
travel/accommodation
subject to eligibility, swag
Buyer-seller commerce is not automatically a
people-connection innovation. No social pivot solely for
this category.
[SpaceXSI] Make it Legendary
with SpaceXSI
$400 heading;
keyboards/raffle described
Supplied brief concerns space data and requires Cursor.
Off-theme for current marketplace.
[Notability] Best Use of
Notability
$396 heading; Pro and
merchandise
No necessary product role established. Using a tool
incidentally is not a reason to claim the track.
Known discrepancies: prize headings versus hardware/gift/credit descriptions; Fetch sponsor amounts
versus Devpost; Spacetime sponsor announcement without listed category/amount; Coinbase body mentioning
two tracks but only one named heading. Resolve with organizers; do not assume all are cash or simultaneously
winnable.
Unconfirmed rule: no verified maximum sponsor-category count or award-stacking policy was found in prior
review. Registration filters do not establish permission. Confirm entry combinations, separate sponsor portals
and required artifacts before submission.

## PDF page 21

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
21
19. General awards, event requirements and demonstration
The supplied event list also contains general awards. They are quality opportunities, not reasons to add
unrelated technologies. Listed rewards below are from the supplied snapshot, not a promise of award value or
eligibility. [S6]
Award
Listed reward / fit
Cal Hacks First Overall
$3,600 heading; MacBook Air or Framework laptop/member description. General
quality target.
Cal Hacks Second Overall / Third
Overall
Nintendo Switch 2 / Google Intelligent Eyewear per member. General quality
targets.
Cal Hacks Most Creative Project
Instax camera plus film/member. Distinctive merchant offer formation and an
understandable negotiation story fit conceptually.
Cal Hacks Most Technically Advanced
Hack
NuPhy Air60 HE/member. Prove scoped tools, versioned offers, policy
enforcement, evidence identity and failure recovery.
Cal Hacks Hacker's Choice
Logitech MX Master 4/member. A clear short live experience is more persuasive
than a wall of agent messages.
Cal Hacks Best Beginner Hack
AirPods 4/member; team eligibility unknown.
Cal Hacks Best People-First Social
Impact Hack
Apple Watch SE 3/member. Conditional on demonstrated user benefit;
affordable-looking prices alone are insufficient.
Cal Hacks Best Planet-First Social
Impact Hack
Parks Pass/member. Refurbishment does not automatically prove reduced
environmental impact; requires defensible reuse evidence.
Cal Hacks Best Hardware Hack
Bambu Lab 3D printer/member. No current hardware component.
Cal Hacks Best Solo Hack
AirPods Pro 3. Not a target for this four-person team; general listing says teams
of 2-4, so apparent category inconsistency is not assumed resolved.
Event and submission checklist
Official header lists October 25, 2026, 9:00 AM PDT. Body copy uses PST inconsistently and lists
venue/check-in requirements; confirm practical timing with organizers. Public requirements include work during
the event, a project image, repository, live or recorded demonstration and a three-minute pitch plus two-minute
questions. No external submission or publication has been performed here. [S6]
Three-minute story, suggested: 0:00-0:30 buyer prompt and concise confirmed brief; 0:30-1:15 actual
scoped merchant tool activity and contrasting fit cases; 1:15-1:45 one truthful competitive feedback/final
concession or justified no-discount; 1:45-2:20 independent sentiment, exact variant caveats and final tradeoffs;
2:20-3:00 selected quote, approval and truthful simulated/sandbox outcome. Keep a recorded fallback with the
same disclosed modes.
Also preserve a short non-tech run and an execution-unknown recovery clip. The primary demo can be a
laptop without implying a laptop-only product. Show mock labels prominently, current commercial reference,
initial/final prices, source timestamps and actual merchant participation. Never portray three fictional catalogs
as three onboarded real businesses.
Evidence pack: Figma file/prototype, screenshot, repository/run instructions, provider feature proofs, source
provenance, bounded run metrics, failure outcomes and sponsor-specific supplemental artifacts once verified.
Explain which pieces are live, cached, synthetic and simulated.

## PDF page 22

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
22
20. Existing products, differentiation and alternatives
Buyer requests, supplier quotes, consumer deal distribution, AI catalog search and autonomous negotiation all
have precedents. These comparisons rely on official descriptions, not hands-on testing. Their existence does
not prove demand for BuyerUnion or rule out another startup with similar features.
Product / pattern
Overlap and credible distinction
Alibaba.com RFQ
Buyers post product requests and suppliers respond with quotations. Direct
overlap with the marketplace mechanism. BuyerUnion proposes consumer-scale,
low-friction requests, authorized agent offer formation and independent product
evidence. [C1]
Amazon Business RFQ
Earlier research documented bulk requirements, supplier offers and checkout.
The official page returned 403 during this refresh, so current eligibility/thresholds
are not restated as verified. It remains a procurement precedent, not proof of
consumer autonomous bidding. [C2]
Carwow
Consumer car configuration and retailer offers show a buyer-led vertical model.
Current partner materials describe enquiry-funded distribution. BuyerUnion spans
manufactured products and proposes constrained agent pricing and evidence
rather than only referrals. [C3]
Google Direct Offers
Merchant-controlled promotions and AI commerce substantially overlap with
personalized offers. BuyerUnion's proposed difference is a persistent buyer
request, independent merchant strategies and transparent comparison instead of
undisclosed promotional priority. No universal availability is assumed. [C4]
Shopify Agentic Storefronts / Catalog
Merchant catalog and checkout distribution into AI channels are becoming
infrastructure. These may be future connectors; a shopping chat over catalog
data alone is weak differentiation. [C5]
Pactum
Enterprise procurement agents run RFQs and negotiate terms. Autonomous
negotiation is already a product category. BuyerUnion proposes merchant-side
agents for ordinary consumer purchases, with a simple buyer flow. [C6]
Best differentiation to demonstrate: the buyer's ordinary-language intent becomes a common confirmed
request; each seller's authorized agent constructs a feasible profitable offer; bounded competition changes a
real permitted price/term; neutral checks and independent sentiment explain the final tradeoff; approval binds
exact terms through execution.
Design alternatives considered
• Public live undercutting is dramatic for identical goods but exposes more strategy and encourages repeated
 price-only competition. Private initial offers plus one final revision are the default.
• Fixed policy-generated quotes are fast and essential as a baseline. Agents must improve matching,
 explanation or authorized concessions enough to justify their cost.
• A buyer maximum shared with all sellers can simplify targeting but anchors prices and weakens privacy.
 Keep it private; allow an explicit target instead.
• A debate vote or seller-authored score is easy to manipulate. Use merchant advocacy plus independently
 computed requirements and published ranking.
• Cross-merchant bundle optimization could improve selection later but adds multiple stock/payment/return
 responsibilities. Keep each demo bundle with one merchant.
Defensibility hypothesis: reliable merchant integrations, trusted policy enforcement, outcome history and
useful buyer demand are more durable than model choice or agent count. No unique-first or proven-moat claim
is made.

## PDF page 23

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
23
21. Trust, platform incentives and commercial risks
The platform supplies seller agents and also helps buyers compare them. This conflict must be managed
through separate scopes, transparent evaluation and visible commercial relationships; it is not solved by calling
one model neutral.
Tension / reachable failure
Requirement and residual uncertainty
Merchant margin versus buyer discount
Enforce independent floors/caps and permit no concession. Demand may fail at
an honest price; do not force a sale.
Private budget becomes a price anchor
Sanitize raw prompts, isolate the ceiling and audit merchant inputs. Explicit
targets are optional. Buyers may still strategically understate a target; truthfulness
is not guaranteed.
Shared software sees competitor
secrets
Separate merchant contexts/policy access and no cross-merchant pooling of
floors or future pricing plans. Platform operators are not cryptographically blind;
real deployment needs specialist review of competition/privacy obligations.
An agent invents suitability or authority
Typed validators, per-attribute provenance, exact variant/unit distinctions and
current policy checks. Unknown hard facts block the offer.
Cheapness hides worse terms
Compare full delivered totals and conditions. A final revision cannot silently
weaken warranty, returns, compatibility or delivery.
Fake competition or fake sentiment
Show actual participant count, real sources, ownership-label provenance and
evidence gaps. Mock merchants are not independent real businesses.
Lead spam and low buying intent
Bounded relevant invitations, private contact details, request expiry and rate
limits. A request is not a purchase commitment; require no deposit in the
prototype.
Neutral rank versus platform revenue
No paid ranking in the demo. Future fees must be visible and independent of
neutral fit. A completed-order fee still creates incentives toward larger orders.
Price creep or speculative shipping
Snapshot terms, expire offers, reserve selected stock only and reapprove
changes. Demo arrival/tax policy is fictional and visibly so.
Limited market liquidity
Validate useful merchants per category/location/deadline, not total registration
count. General product scope does not eliminate local supply gaps.
Scraped pages inject instructions
Read-only evidence boundary, source allowlist and no authority-bearing tool
access. Scraped claims cannot approve, change policies or execute payment.
Revenue direction, unresolved: prefer testing a transparent completed-order charge or paid merchant
automation over pay-per-bid. The first aligns revenue with an outcome but raises fee/refund/bypass issues;
subscriptions need enough recurring demand; lead fees can reward noise. No monetization is implemented or
fee rate assumed in the demo.
Seller and support roles: eventual merchants remain identified sellers and fulfillment providers; the platform
owns matching, offer presentation and its own support obligations. Do not promise escrow, guaranteed
authenticity, delivery insurance or adjudicated refunds without a separately designed service. Keep the
selected offer record for support; the prototype ends at an explicitly fictional order.

## PDF page 24

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
24
22. Impact, experiments and success measures
The intended outcome is a suitable, understandable and potentially better-priced purchase opportunity that the
merchant can honor profitably. A hackathon demo can prove mechanics; it cannot establish actual conversion,
loyalty or merchant profitability with fictional inventory.
Question
Measure / fair comparison
Does prompt intake save effort?
Buyer corrections, clarification turns and time to confirmed accurate need versus
ordinary filters. Check misunderstanding, not only speed.
Does competition improve offers?
Initial-to-final delivered price, terms and contribution on the same validated
candidate; proportion improved, held and abstained; zero/one/multiple merchant
participation.
Are agents better than a rule?
Compare fixed catalog matching, automatic maximum discount, and bounded
agent bidding on identical fixture requests and policies. Hold
inventories/requirements constant.
Do buyers receive value?
Time to qualified offers, comparison effort, task completion, understanding of
tradeoffs and equivalent delivered cost. Budget minus paid amount is not
savings.
Do merchants receive value?
Contribution after permitted concessions and fees, quotation effort, incremental
completed sales, returns and repeat participation. Mock results are simulated.
Is evidence useful?
Exact-variant coverage, cited/uncited claims, duplicate rate, source freshness,
disagreement and correct unknown labels. Number of scraped pages alone is not
quality.
Is execution dependable?
Reservation contention, stale quote rejections, changed terms, duplicate
attempts, unknown reconciliations and correct mode-specific receipts.
Is compute justified?
Cold/cached latency, model/tool calls, token/provider cost and material
corrections per additional round. Compare one council round against a justified
extra verification round.
Experiment plan
Create an offline request suite across all category profiles: exact requests, broad use cases, conflicting
requirements, tight deadlines, low/private ceilings, disclosed targets, scarce stock and missing facts. Replay
the same states under three pricing baselines. Report validity and margin separately from discount depth.
Synthetic buyer-choice outcomes test the simulator, not human conversion.
Next, recruit a small consented pilot with real buyer needs and authorized merchant policies. Ask whether
sellers would honor the resulting quote after their actual costs and whether buyers would choose it after
ordinary alternatives. Test whether discounts create new purchases or merely reduce revenue on purchases
that would have happened anyway. No sample size or representative outcome is claimed in advance.
Discount reporting: compare the exact item's genuine reference price and final item price, plus the complete
delivered totals. For different bundles or terms, describe the difference; do not claim an equivalent saving
without a defensible baseline. Never manufacture a reference price or count the private budget as the baseline.
Go/no-go after a pilot: poor inventory authority, mostly single-seller coverage, merchant refusal to repeat,
larger research effort than ordinary shopping, or negligible improvement over fixed filtering would challenge the
business. A technically impressive council is insufficient if the offers are unreliable or economically unattractive.

## PDF page 25

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
25
23. Functional and failure acceptance requirements
Test group
Required expected result
Intake / categories
Broad/exact input confirms a profile. Windows/16GB/512GB rejects P6. Cotton
100% + DemoWear M rejects C2; width <=600 mm rejects H2; US 120 V/60 Hz
plug rejects A2. No laptop fields required on clothing. Unknown category stays
draft.
Policy
Below-floor, wrong SKU, false warranty, incompatible accessory, bad
cents/quantity or unknown hard fact rejected despite valid JSON. One repair or
abstention.
Privacy
Buyer A cannot read B; merchant A cannot read/edit B; forged roles fail;
ceiling/floors absent from opponent prompts, public data and logs.
Council / rank
Three actual isolated tool-using contexts; bounded rounds; rhetoric changes no
rank; self-scores cannot override neutral assessment; same snapshot sorts
identically; extra round logs a material trigger.
Evidence
Wrong configuration/size/region not exact evidence; unknown health fails
threshold; synthetic C/H/A fixtures get no borrowed reviews. Laptop and genuine
non-tech source retrieval tested; blocked/injected pages stay safe.
Version / refill
Edits make old completion stale; factual invalidation refills once within limits;
fewer results truthful; no fabricated review/restart.
Inventory
Last unit: one hold wins; delayed cleanup cannot permit expired approval;
duplicate release restores nothing twice; failed selection swap preserves valid
hold.
Execution
Double click: one attempt/order; expiry preserves execution lock;
unknown_then_success reconciles once; decline releases once; tokenization
never claims charge.
Recovery / UX
Reload resumes; timeout produces partial result/retryable failure; nested refresh
works; modes visible. All Figma handoff states connect to real typed responses;
keyboard completion works.
New pricing and prompt cases
• A broad prompt leads to a short conversational clarification and confirmed summary; no technical form is
 required. An ambiguous price remains unconfirmed; merchants never receive raw private ceiling text.
• Same public request/current market with a different private maximum: merchant initial pricing inputs stay
 unchanged; do not require bit-identical nondeterministic model outputs. Affordability/selection and the
bounded negotiation gate may differ; private limits do not become quote anchors. An explicitly shared target
is an allowed input.
• A/B accessory bids below 23/32 USD are rejected. A 10%-cap policy rejects larger reductions even if the
 operator floor is lower. C can win without discount or abstain.
• A policy-valid offer above the private ceiling may remain an internal negotiation candidate; it cannot be
 selected. Final concessions can make it affordable without revealing the ceiling.
• No genuine rival means no competitive-auction claim. A requested one-seller counteroffer is labeled
 negotiation. Final bids remain hidden until close; duplicate/mismatched submissions are handled
idempotently.
• A seller that does not revise retains its valid earlier offer. A revision that raises delivered price or silently
 weakens terms is rejected. A new product must pass all constraints and be visibly identified.

## PDF page 26

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
26
• Eligible-only ranking and score components are reproducible. A seller's persuasive prose cannot make
 unknown hard facts pass. Savings use the same item/condition/quantity/terms/reference snapshot.
24. Implementation milestones, ownership and resources
Milestone
Work split and exit gate
M0: foundation
A/B Figma states and UI contracts. C category/catalog/policy/auth contracts +
model tool test. D state/holds/payment + source access test. Agree schemas
before parallel UI work.
M1: thin path
A buyer UI + B merchant UI wired to C valid offer + D hold/approval/simulation.
Reject unauthorized transitions.
M2: differentiation
C merchant agents/council/profile validation and sealed repricing. D
evidence/identity/refill and Workflow. A/B progress/comparison/council/evidence
screens; exercise laptop, clothing, household and appliance fixtures.
M3: hardening
C policy/privacy/adversarial tests; D lock/reconciliation, Visa gate and source
failures; A/B all error/expiry/accessibility states.
M4: submission
A/B Figma and demo evidence; C/D integration proof. All repeat runs,
video/image/repo, truthful modes and category eligibility.
With two backend builders, prioritize the shared flow and category tests. If time runs short, cut optional
integrations/Actor packaging before category support; retain a laptop and one non-tech end-to-end demo.
Candidates: Visa, Apify, Convex, Gemini API, genuine Vultr hosting and Figma; Best Actor/Figma Agent
conditional. Fetch AI excluded by UI choice; Spacetime replaces Convex. Elastic/Factory/Cartesia deferred.
Compare agents against plain catalog filtering.
Owners and integration seam: A buyer Figma/UI, B merchant Figma/UI, C catalog/policy/agents/pricing, D
orchestration/evidence/reservations/execution. C/D agree state and pricing contracts together; A/B consume
frozen fixtures before keys arrive. Shared changes require updating contracts and fixture snapshots, not
separate ad hoc payloads.
M0 exit: functioning development auth, all-category seed import, extraction schema and sanitized merchant
projection, one model tool call, one real source extraction, initial budget caps, and a connected UI shell. M1
must work before extra sponsors. M2 adds actual differentiation. M3 runs the adversarial suite and records
cold/warm timing. M4 preserves the exact demo configuration and proof of each claimed integration.
Resources: Convex deployment; Gemini API project/quota; Apify account/Actor access; Figma collaboration
access; optional Visa sponsor credentials; Vultr hosting/HTTPS access; source registry; disposable operator
accounts. No credentials belong in the document or repo. Provider access, credits, source success and an
optimal runtime budget are not assumed.
25. Roadmap and path from prototype to real commerce
Prototype completion
Complete prompt -> common brief -> scoped inventory search -> validated offers -> council -> conditional final
bids -> neutral fit and independent sentiment -> reservation -> explicit approval -> truthful result. Exercise all
four profile families; a laptop and one genuine non-tech product show real-source applicability. Use disclosed
mock commercial stock and policies throughout.

## PDF page 27

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
27
Authorized merchant pilot
Replace fictional listings with an explicitly authorized connector or merchant-maintained feed. Record seller
identity, permissions, freshness and actual policy authority. Public storefront scraping alone does not establish
private quantity, unit condition, cost, delivery capacity or discount authority. Show an indicative quote until the
merchant can commit its stock and terms.
Support read-only connection first, then quote permission, then reservation/order permission through
separately tested adapters. Do not treat a connected catalog as permission to change prices or fulfill orders.
Retain the same offer, approval and execution contracts.
Pilot merchant-provided costs or floors; merchants need not expose full accounting to buyers or rivals.
Measure repeat participation, contribution and incremental demand before training an alleged optimal-pricing
model. The platform must not pool confidential future strategies across sellers to coordinate prices.
Broader category and merchant coverage
Add profiles and real evidence sources with positive/negative applicability tests. Clothing needs explicit
sizing/measurement conventions; appliances need electrical and installation scope; household products need
interface/dimension certainty. Scale matching before expensive generation: category, service area, condition,
quantity and deadline first, then relevant merchants.
At greater scale, use indexed/semantic retrieval where it measurably helps, durable fan-out, quota/cost
allocation, immutable audit history and provider-specific connectors. External merchant agents can later use a
narrow typed quote protocol with authenticated identity and enforced policy; the prototype's internal context ID
is not a public agent-verification standard.
Later extensions requiring separate product decisions
Cross-merchant basket optimization; group buying; real delivery/installation capacity; order tracking and
customer support; returns/refund reconciliation; voice/photo intake; merchant approval queues; external
agents; learned price-response models; subscription or transaction fees. Each adds distinct authority, data and
support work. A single buyer approval screen does not create atomic multi-seller settlement or escrow.
What will remain true: prompt-first simplicity, manufactured-product breadth, merchant-controlled commercial
limits, actual competition rather than staged rhetoric, buyer-private ceiling, transparent scoring, independent
applicable evidence and approval of exact final terms.
Recommended next action: M0 contract freeze between A/B and C/D, followed by one complete simulated
purchase. Prove the state/permission boundary before expanding sponsor claims. The absence of real
merchant permission is resolved for the mock demo, not for a production launch.

## PDF page 28

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
28
26. External dependencies and questions to resolve
Dependency
Status / safe behavior
Merchant authority
Resolved for prototype: fictional merchants/stock approved and labeled. No live
seller permission needed for this demo.
Provider accounts
Convex/Gemini/Apify access and quotas untested. Actual use must be
demonstrated; fixtures/contracts can be built while obtaining keys.
Source coverage
Exact Actor/source pairs need testing for laptop and genuine non-tech item. Real
cache/unavailable is valid; synthetic reviews prohibited. New category profiles
need field/provenance tests.
Visa
Operation/access unknown; simulation reliable default. Enable only a tested,
accurately labeled capability.
Figma / eligibility
A/B own design/UI. Confirm Figma access, exact judging proof, Agent access if
targeted, category/award limits and Best Actor publication rules. No prize
eligibility guaranteed.
Deployment
Confirm sponsor accounts/credits and hosting access; no spend/public
deployment performed here.
Questions with assigned timing
• M0, D: What Visa sandbox operation/access is available, and can it establish the exact quote amount,
 idempotency and terminal status? Use simulation unless verified.
• M0, D: Which source-specific Actors and lawful accessible sources provide real applicable product/owner
 evidence? Which exact non-tech product is supported? Preserve honest unavailable states.
• M0, A/B: Which Figma categories, Agent access and design/proof artifacts are accepted? Confirm sponsor
 category caps and award combinations with organizers.
• M0, C/D: Measure model availability, source latency, provider quotas and cost. The selected model and caps
 are configurable starting choices, not performance guarantees.
• Pilot, C: Will actual merchants authorize discounts and stock/order access, and is contribution still positive
 after real costs and fees?
• Pilot, all: Will enough buyers submit useful requests and enough merchants repeatedly respond? Can this
 beat fixed-price search plus ordinary promotions?
Readiness verdict: product flow, role boundaries, commercial mechanism, data/state contracts and proposed
implementation defaults are specified enough to begin the prototype. Provider operations and actual runtime
behavior still require tests. No document can certify zero future implementation gaps.
Verification boundary: source/document review and PDF layout checks only. No application code, model
request, Actor extraction, deployed auth, reservation, pricing model calibration or Visa operation has been
executed. Test cases describe required outcomes, not observed passing application tests.
TLDR: v4 consolidates the prompt-first multi-category marketplace, merchant incentives and bounded bidding,
neutral fit and independent sentiment, Figma responsibilities, implementation safeguards and sponsor/prize
strategy. Begin with shared contracts and one end-to-end simulated path; access, evidence coverage,
eligibility and real market economics remain open.

## PDF page 29

BUYERUNION  /  VISA AUDIT + PRODUCT REQUIREMENTS
CalHacks 13.0 | Planning document | Checked October 23, 2026
29
27. Source ledger and evidence limits
• S1: Vite deployment, environment, Convex actions, Workflow, scheduler.

• S2: Convex Auth setup, Anonymous, Password, authorization. No client-controlled role assignment.

• S3: Gemini 3.6 Flash, function calling, structured outputs. Shape does not establish truth.

• S4: Apify async runs, running Actors, webhooks. Source access/cost/output need testing.

• S5: Visa Intelligent Commerce, quick start. Tokenization alone is not checkout.

• S6: Event requirements, Fetch AI hackpack. ASI:One requirement conflicts with chosen UI; award stacking
 unconfirmed.
• S7: Apple MacBook Air M2 2022 US specs.

• S8: Apple MacBook Air 13-inch M3 2024 US specs.

• S9: Apple MacBook Air 13-inch M4 2025 US specs.

• S10: Lenovo US 21ML0053US. Specifications, not availability.

Research and market references
• R1: Gartner shopping-AI research. Two separate surveys; avoid generalizing subgroup results.

• R2: Baymard checkout research. Usability findings, not a conversion forecast for this project.

• R3: Selected durability discussion. Anecdotal, unverified accounts; no representative social-listening sample.

• R4: Selected clothing-size discussion. Anecdotal fit concerns.

• R5: FTC individualized pricing study. Initial staff findings, not a legal ruling about BuyerUnion.

• R6: Auction theory overview. Mechanism background, not a proof of this marketplace's equilibrium.

• S11: Spacetime event announcement. Special prize mentioned; exact category/amount unconfirmed.

• C1: Alibaba RFQ.

• C2: Amazon Business RFQ. Prior review; current refresh returned 403.

• C3: Carwow partner model.

• C4: Google Direct Offers.

• C5: Shopify Agentic Storefronts announcement.

• C6: Pactum tactical sourcing.

Sponsor prize details principally use the two supplied event snapshots; their heading/description conflicts are
preserved. Official event/Fetch/Spacetime pages provide current cross-checks, not confirmation of eligibility or
award stacking. Original research reports remain background: visa-shopping-research.md and
buyerunion-marketplace-report.md. Older laptop-first recommendations in those reports are superseded here.

## Original hyperlink ledger

- <https://vite.dev/guide/static-deploy.html>
- <https://vite.dev/guide/env-and-mode.html>
- <https://docs.convex.dev/functions/actions>
- <https://www.convex.dev/components/workflow>
- <https://docs.convex.dev/scheduling/scheduled-functions>
- <https://labs.convex.dev/auth/setup>
- <https://labs.convex.dev/auth/config/anonymous>
- <https://labs.convex.dev/auth/config/passwords>
- <https://labs.convex.dev/auth/authz>
- <https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash>
- <https://ai.google.dev/gemini-api/docs/generate-content/function-calling>
- <https://ai.google.dev/gemini-api/docs/generate-content/structured-output>
- <https://docs.apify.com/api/v2/actors-runs-post>
- <https://docs.apify.com/actors/running>
- <https://docs.apify.com/integrations/webhooks>
- <https://github.com/visa/ai/wiki/Visa-Intelligent-Commerce>
- <https://developer.visa.com/docs/quick-start>
- <https://cal-hacks-13-0.devpost.com/>
- <https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack>
- <https://support.apple.com/en-us/111867>
- <https://support.apple.com/en-us/118551>
- <https://support.apple.com/en-us/122209>
- <https://psref.lenovo.com/Detail/2475?M=21ML0053US>
- <https://www.gartner.com/en/newsroom/press-releases/2026-05-27-gartner-survey-finds-consumers-want-ai-shopping-help-but-not-ai-purchase-decisions>
- <https://baymard.com/blog/reduce-cart-abandonment>
- <https://www.reddit.com/r/BuyItForLife/comments/1nxr1m7/how_do_you_find_a_product_that_actually_lasts/>
- <https://www.reddit.com/r/PlusSize/comments/1kcmvoy/shopping_online_size_charts_nothing_makes_sense/>
- <https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-surveillance-pricing-study-indicates-wide-range-personal-data-used-set-individualized-consumer>
- <https://www.cs.cmu.edu/~sandholm/cs15-892F15/Ausubel_Auction_Theory_Palgrave.pdf>
- <https://spacetimedb.com/blog/spacetime-at-calhacks>
- <https://seller.alibaba.com/rfq?tracelog=paid_in>
- <https://business.amazon.com/en/solutions/bulk-buying/request-for-quote>
- <https://www.carwow.co.uk/partners/new>
- <https://business.google.com/us/accelerate/announcements/direct-offers/>
- <https://www.shopify.com/news/agentic-commerce-momentum>
- <https://pactum.com/procurement-agents/tactical-sourcing>
