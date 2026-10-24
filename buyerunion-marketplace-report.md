# BuyerUnion: a buyer-led marketplace with merchant agents

Research cutoff: October 23, 2026. This report develops the fifth concept from the earlier Visa shopping report. Product flows, example prices, policies, metrics, and recommendations below are proposals unless explicitly attributed to a source. No marketplace, merchant integration, or payment flow was tested.

## Recommendation

**Build a buyer-led marketplace for complete, purchase-ready offers.** A buyer describes a need and its constraints. Qualified merchants receive a limited request, and each merchant's agent independently proposes an offer using that merchant's inventory and authorized commercial rules. The platform checks the offers, makes their differences understandable, and carries the selected offer through a reliable purchase.

Think of obtaining comparable contractor quotes, made fast enough and simple enough for consumer shopping. The buyer initiates the opportunity; merchants decide whether and how to compete.

The important change to the initial description is the meaning of **“bid against each other.”** I recommend private initial offers followed by one optional improvement round. A public race to keep lowering prices is a possible feature for identical goods, but a weak foundation for the whole market. Sellers should also compete through availability, condition, warranty, delivery, installation, accessories, and other relevant terms.

Your proposal to provide the merchant agents is valuable because merchants need not build their own software. It also creates the central trust problem: the platform supplies sellers' agents while helping the buyer choose among them. That conflict needs visible rules and real data boundaries.

## 1. The core idea and intended direction

**Plain-language promise:** Describe what you need once. Verified merchants send complete offers they are authorized to honor. Compare the important tradeoffs, choose, and buy.

The original direction was **consumer procurement**: give ordinary shoppers some of the structured comparison and supplier competition that businesses use when purchasing. Procurement simply means organizing a purchase around requirements, supplier offers, and a decision.

The product has three connected parts:

| Part | Whom it serves | Its job |
|---|---|---|
| Buyer assistant | Buyer | Turn a need into editable requirements, protect private preferences, explain offers, and request purchase approval. |
| Merchant agent | One merchant | Find suitable stock and formulate profitable offers within that merchant's authority. It may decline a request. |
| Marketplace | Both sides | Match requests, enforce participation rules, validate offers, provide a clear comparison, and coordinate purchase/support responsibilities. |

These roles should have different objectives. A merchant agent represents its merchant; it should not pretend to be an impartial personal shopper. The marketplace can provide fair procedures without claiming to maximize both the buyer's savings and every merchant's margin simultaneously.

The strongest value proposition has three outcomes: less buyer research, less merchant quotation work, and fewer surprises between quote and fulfillment. Whether those outcomes occur is the main validation question.

## 2. A complete example

All prices and merchants in this example are fictional.

A student writes: “I need a portable laptop for university. Refurbished is fine. It must have at least 16 GB memory, 512 GB storage, USB-C charging, and a 12-month warranty. I need it by Friday.”

The buyer assistant clarifies any material ambiguity—such as an operating-system requirement or required software—and shows the buyer an editable summary. The buyer privately sets a $900 all-in ceiling and prefers lower cost over extra accessories. The maximum is not automatically included in the merchant request. If a buyer voluntarily shares a target range, explain that it gives sellers useful context but can also influence their pricing.

Eligible merchants submit structured offers:

| Offer | Illustrative all-in total | Relevant terms | Treatment |
|---|---:|---|---|
| Merchant A | $720 | Suitable specification, arrival Monday after the deadline | Excluded from compliant results; available separately as a near match if the buyer wants to reconsider the date. |
| Merchant B | $810 | Exact model identified, arrival Friday, 12-month warranty | Lowest complete price among these qualifying offers. |
| Merchant C | $860 | Exact model identified, arrival Friday, 24-month warranty and a hub | Higher cost with additional protection and accessories. |

The buyer sees the meaningful choice: B meets the request at the lower cost; C offers additional benefits. The system does not call $860 universally “best” or announce a $90 saving merely because the private ceiling was $900.

An optional improvement round might ask shortlisted merchants whether they can improve delivery, protection, or total price under their own policies. Merchants do not receive rival confidential bids, private buyer limits, or instructions to undercut by one cent.

When the buyer selects B, the platform obtains a short reservation where supported and finalizes the destination-dependent total. If anything material changes, the buyer sees the change before approving. An accepted, unchanged offer then becomes an order with identifiable seller, product, terms, and support route.

## 3. The buyer journey

1. **Describe the need.** Use natural language, a reference photo, or an existing product as a starting point. Avoid making the user complete a business procurement form. The listing can be a private request distributed to eligible merchants; it does not need to be a public post exposing the buyer's plans.
2. **Confirm requirements.** Separate hard constraints from preferences. A model must not silently replace “16 GB required” with “8 GB is close enough.” Unknown requirements need clarification or an explicit unknown label.
3. **Choose disclosure.** Keep the maximum budget, personal history, and detailed ranking preferences private by default. Share only the location granularity and requirements needed for useful offers.
4. **Receive results by a stated time.** Display actual participation and distinguish researching, comparing, and ready-to-purchase requests. A request is not proof of intent to buy.
5. **Compare a few useful offers.** Show exact products, condition, total cost or clearly labeled estimate, arrival, warranty, returns, expiry, and stock commitment. Let the buyer inspect all eligible offers behind the shortlist.
6. **Approve the firm offer.** Finalize taxes, shipping, and availability before asking for payment approval. Changes to a material requirement or quote require renewed consent.
7. **Track the outcome.** The order should retain the approved offer and provide a clear route for delivery exceptions, cancellations, returns, and refunds.

When no match exists, show the limiting constraints and ask which, if any, the buyer wants to relax. When only one seller qualifies, label it as one offer; do not manufacture a competitive auction narrative.

## 4. What the merchant gets

The merchant product is an automated, controlled sales desk. It watches relevant demand, identifies feasible orders, creates quotes, and passes approved purchases into ordinary operations.

### Onboarding

Register the business and identify the actual seller. Connect the merchant's existing catalog, stock, service capacity, delivery area, policies, and fulfillment system. A manually maintained file can support an early test, but its freshness and limitations must be visible.

“Scan inventory” needs precision. Reading a public storefront can enrich descriptions or show advertised stock. It generally does not establish private quantities, acquisition costs, delivery capacity, or authority to discount. Those inputs must come from the merchant or its authorized systems.

The merchant can provide minimum sale prices and allowed concessions without revealing full cost accounting. If profit calculation is offered, the merchant must provide the relevant cost assumptions; the language model should not invent them.

### Merchant-controlled policy

The merchant chooses which products participate, approved substitutes, price floors, fees/cost assumptions, delivery capacities, allowable warranties, maximum discounts, and conditions requiring human approval. It can set rules such as “never change warranty terms,” “do not offer the last display unit,” or “request approval for unusually large orders.”

The agent must be able to abstain, explain its own decisions to the merchant, and pause immediately. Exception approval is a useful first operating mode; more autonomy can follow when actual performance supports it.

### A credible merchant reason to join

Potential benefits include qualified incremental demand, less quotation work, selling suitable excess inventory, and competing on services that ordinary price comparisons overlook. Merchants need not always discount. A seller with the right item and a feasible delivery slot may win at its regular price.

These benefits must be demonstrated after fees, returns, and operational work. Providing a capable agent does not create margin or make unprofitable demand attractive.

## 5. How bidding should work

| Mechanism | Strength | Weakness | Recommended use |
|---|---|---|---|
| Public live undercutting | Easy to understand for the same product under identical terms. | Exposes rival strategy, encourages price fixation, creates noise, and makes dissimilar offers hard to compare. | Optional later mode for tightly standardized purchases. |
| Private structured offers | Each merchant independently proposes complete terms without seeing rivals' offers. | Can miss some improvements that interactive price discovery would produce; sellers still bid strategically. | Default first round. |
| Private offers plus a bounded improvement round | Allows a real competitive response on price or terms with a clear endpoint. | Feedback rules need care; it does not guarantee truthful bidding or the globally best price. | Recommended design to test. |
| Instant policy-generated quotes | Fast results from existing inventory and merchant rules. | Adds little if it only reproduces ordinary catalog prices and filters. | Useful underlying service and a comparison baseline. |

Before the first round, freeze the confirmed request version and provide equal material clarifications to participating merchants. Do not privately tell one seller more about the buyer's requirements in exchange for fees. Material changes create a new request version and invalidate incompatible quotes.

Let the buyer's priorities guide comparison, but keep the interface intelligible. “Cheapest qualifying,” “earliest arrival,” and “strongest warranty” are easier to assess than an unexplained 92.4-point value score. These labels require meaningful differences and evidence; do not invent a winning category for every seller.

It is reasonable to test whether a second round helps. It is not reasonable to assume more agent messages mean more competition or value. A historical GAO review found over one-third of FY2012 federal reverse auctions had no interactive bidding. This is old public-procurement evidence, not a consumer-market forecast, but it illustrates the distinction between operating an auction and achieving competition. [GAO, December 2013](https://www.gao.gov/products/gao-14-108)

## 6. Where AI is useful—and where rules should decide

AI helps interpret ambiguous needs, map requirements to heterogeneous catalogs, propose useful bundles, formulate permitted concessions, ask clarifying questions, and explain tradeoffs. It may turn “I need a university setup” into a suitable laptop, charger, warranty, and delivery proposal.

Ordinary software should validate prices, stock, authority, required specifications, deadlines, and payment state. Merchant commercial limits belong in enforceable policy checks, not only in a prompt saying “please do not discount too far.” Catalog descriptions and messages are data; they must not be able to grant an agent new permissions.

If the task is “find the cheapest exact model with fixed posted prices,” a filter and price comparison may be enough. The agent earns its role when it produces a genuinely useful offer or resolves ambiguity that the simpler baseline cannot. Test that distinction instead of treating agent count as technical achievement.

## 7. The central tensions and failure modes

These are design scenarios and inferences about the proposed marketplace unless a source is identified. They are not claims that these failures have already happened on this platform.

| Tension | Realistic failure | Design response and remaining cost |
|---|---|---|
| **Buyer value versus merchant margin** | Repeated undercutting leaves honest sellers with no worthwhile profit. | Allow abstention, independent floors, bundles, and nonprice competition. Some buyers will receive fewer discounts; that is an honest tradeoff. |
| **The platform knows both sides' limits** | A private $900 buyer ceiling is used to steer a seller's quote toward $899. | Isolate buyer-private data from merchant-agent inputs. Audit what information informed offers and rankings. A neutrality policy without technical controls is insufficient. |
| **Shared agent provider versus independent competition** | The same service uses competitors' nonpublic margins or future bids to coordinate prices. | Separate merchant policies, private data, and decision-making; do not pool confidential strategies into pricing. This warrants specialist competition review before launch. Shared software alone does not establish a legal violation. |
| **Low price versus actual suitability** | An offer wins by omitting delivery, weakening warranty, or substituting the wrong model. | Validate must-haves before ranking, normalize full terms, and show exceptions separately. More validation increases data and onboarding work. |
| **Buyer convenience versus credible intent** | People post speculative requests and disappear after sellers spend time preparing quotes. | Label intent honestly, expire requests, limit abuse, and reduce merchant work through automation. Do not equate a verified phone number with a verified intention to buy. |
| **Merchant reach versus spam** | Buyers receive dozens of generic pitches and aggressive follow-up messages. | Invite relevant sellers, require structured compliant offers, control message volume, and keep contact details private until needed. More sellers are useful only if they add distinct options. |
| **Speed versus market depth** | Only one merchant has a suitable item for this location and deadline. | Show real coverage and waiting time. Recruit around actual category/location needs. Registration totals do not measure useful liquidity. |
| **Availability versus reservation** | The last item sells through another channel while an offer is being compared. | Label indicative stock, verify freshness, and acquire a short selected-offer hold where supported. Holding every quoted item would obstruct merchants' normal sales. |
| **Autonomy versus authority** | An agent invents a warranty or promises a delivery slot already at capacity. | Generate from authorized terms and validate them; route exceptions to the merchant. A merchant must know what its agent can commit to. |
| **Transparency versus strategic gaming** | A seller probes rejection feedback to infer budgets or rival floors. | Use bounded rounds and limited necessary feedback. Private bids reduce some leakage; they do not eliminate inference or strategic pricing. |
| **Neutral recommendations versus platform revenue** | A higher-fee or higher-price offer wins the “best” label. | Keep recommendation logic independent of fees and disclose commercial relationships. A success fee still creates incentives to favor higher order values. |
| **Useful matching versus privacy** | A request reveals a precise home address, urgent need, or dates the person is away. | Share coarse service areas and necessary constraints first. Share full fulfillment details with the selected party when needed. Useful constraints can themselves reveal information. |
| **Transactions versus off-platform bypass** | Parties obtain quotes here and transact elsewhere to avoid fees. | Earn ongoing participation through execution, support, reliable reservations, and records. A platform that contributes only introductions has a weak continuing value proposition. |
| **Broad bundles versus accountability** | Two merchants accept payment and a third cannot fulfill the missing part of a setup. | Start with a single merchant supplying a bundle. Later state whether the platform guarantees the whole package or coordinates separate purchases, with explicit recovery behavior. |
| **Merchant brand versus platform ownership** | Sellers fear losing customer relationships while buyers cannot identify the warranty provider. | Show merchant identity, responsibility, brand, and support terms. Do not obscure the seller just to make the platform appear universal. |
| **Claims versus physical reality** | A refurbished item has poorer battery health or condition than promised. | Require category-specific evidence, exact unit/grade terms, acceptance rules, and a dispute route. Business registration or a signed quote alone does not prove quality. |

The shared-pricing concern has a concrete adjacent precedent: DOJ's November 2025 RealPage announcement described a proposed settlement addressing competitors' nonpublic information and pricing alignment. It concerns a different market and case; it is a reason to examine these data flows, not a legal conclusion about BuyerUnion. [DOJ announcement](https://www.justice.gov/opa/pr/justice-department-requires-realpage-end-sharing-competitively-sensitive-information-and)

Lead quality is also a documented business risk. The FTC's April 2023 final HomeAdvisor order addressed misleading claims about lead quality, origin, matching, and conversion. The lesson is to describe buyer intent and marketplace results truthfully, including to merchants. [FTC final order announcement](https://www.ftc.gov/news-events/news/press-releases/2023/04/ftc-approves-final-order-against-homeadvisor-inc-deceptively-marketing-its-leads-home-improvement)

## 8. What current user discussions add

In a [2025 Alibaba RFQ discussion](https://www.reddit.com/r/importexport/comments/1m8k1ek/anyone_here_actually_using_alibabas_rfq_tool/), the buyer asks whether the service produces useful quotes or generic replies. Replies include seller concerns about cost and mixed relevance; some are promotional. This is qualitative support for making relevance and useful responses the product, rather than promising that more quotations automatically help.

A [recent Thumbtack discussion, displayed as one month old when accessed](https://www.reddit.com/r/Thumbtack/comments/1vyacab/yea_im_done_with_thumbtack/), shows a conflict of expectations: providers complain about paying for enquiries that do not convert, while a self-described customer says they did not realize providers paid to receive contact. Specific allegations and charges are unverified. The design implication is to make the commercial arrangement understandable to both sides and avoid pressuring buyers to purchase simply because a merchant incurred a lead fee.

These threads are selected, self-reported anecdotes, not estimates of prevalence or proof of typical platform performance. They suggest interview questions and failure scenarios.

## 9. Existing products: comparison and contrast

Official product descriptions were checked, but accounts, eligibility, fees, integrations, and transaction execution were not independently exercised. Undated pages describe current vendor claims, not independently archived rollout history.

| Product | Existing overlap | Important difference and lesson |
|---|---|---|
| **Alibaba RFQ** | Buyers post requirements; suppliers send quotations. Supplier plans govern RFQ access. | Very direct overlap with the foundational listing-and-bidding flow. Consumer simplicity, merchant-authorized automation, structured comparison, and fulfillment would need to carry the differentiation. [Official RFQ](https://seller.alibaba.com/rfq?tracelog=paid_in) |
| **Amazon Business RFQ** | Requirements, supplier offers, selection, and checkout for qualifying bulk orders. Its public U.S. FAQ generally specifies more than $10,000 or more than 999 units, with lower thresholds for books. | Demonstrates that quote competition plus checkout already exists. BuyerUnion could address consumer-scale, heterogeneous needs and independent merchant offer formation; these differences need proof. [Official page](https://business.amazon.com/en/solutions/bulk-buying/request-for-quote) |
| **Carwow new-car offers** | Consumers configure a car and compare dealer offers, then contact a dealer. | Strong precedent for high-value consumer purchases with structured requirements. Do not confuse it with Carwow's separate car-selling auction, where dealers are buying the user's car. Current public dealer fee descriptions are inconsistent, so exact contract fees are unverified. [Partner page](https://www.carwow.co.uk/partners/new) |
| **Thumbtack** | Customers describe projects and connect with matching service professionals. Providers pay for leads under the described model. | A relevant example of request matching and the tensions of monetizing enquiries rather than completed goods orders. It is not an inventory-aware retail-agent auction. [Pro flow](https://www.thumbtack.com/pro/jobs), [signup model](https://www.thumbtack.com/pro-signup) |
| **Google Direct Offers** | Current official material describes merchant guardrails, Gemini-constructed customized bundles, offers in AI Mode, and native checkout for UCP merchants. | A much closer AI-commerce competitor than “a coupon tool.” The January 2026 pilot framing does not capture all current advertised capabilities. BuyerUnion would need a persistent buyer-owned request, independent competing offers, visible rules, and fulfillment reliability. General merchant eligibility was not verified. [Current product page](https://business.google.com/us/accelerate/announcements/direct-offers/) |
| **Shopify Agentic Storefronts / Catalog** | Product and inventory distribution to major AI channels, with order and checkout infrastructure. March 2026 announcement also describes the publicly available Agentic plan for non-Shopify merchants. | Catalog ingestion and making merchants accessible to AI are becoming existing infrastructure. This can be a substrate for your platform, not its main novelty. Channel eligibility and fees vary. [March announcement](https://www.shopify.com/news/agentic-commerce-momentum) |
| **Pactum** | Enterprise procurement agents conduct sourcing, RFQs, and negotiation. Its pricing page describes an annual subscription. | Autonomous negotiation is an existing category. The documented buyer-enterprise product does not establish that every supplier is represented by another autonomous agent. Consumer-scale merchant agents and retail fulfillment are the proposed distinction. [Tactical sourcing](https://pactum.com/procurement-agents/tactical-sourcing), [pricing](https://pactum.com/pricing) |
| **ONDC** | An Indian network separates buyer applications, seller applications, and other commerce responsibilities. Buyer apps parse requests, rank products, and support ordering. | Architectural precedent for connecting both sides without owning every component. It is not evidence of merchant reverse bidding. It illustrates that buyer-facing support and network responsibilities must be explicitly assigned. [Buyer participants](https://www.ondc.org/pages/buyer-network-participants.html) |

The novelty is not any one component: buyer requests, quotes, agents, inventory feeds, and checkout all have precedents. The defensible thesis is that their combination improves a specific consumer purchasing journey. This research is not exhaustive and does not establish first-in-world status.

## 10. The most important trust boundary

| Information | Recommended visibility |
|---|---|
| Buyer maximum budget, fallback willingness, personal history | Buyer-side private evaluation; not merchant agents or fee-driven ranking logic. |
| Merchant minimum prices, costs, margin targets, strategy | That merchant's authorized policy service and agent; not competitors or buyer-facing explanations. |
| Functional need, hard requirements, acceptable substitutions, coarse destination, deadline | Eligible participating merchants, as confirmed by the buyer. |
| Full quote and exceptions | Buyer and the quoting merchant; rival merchants receive only the limited feedback permitted by the round rules. |
| Fulfillment address and payment authorization | Selected parties and necessary processors, at the appropriate step. |

Default platform-supplied agents should have separate permissions and private storage. The neutral offer validator should need the offer and request, not a merchant's hidden margin floor. Merchant-side validation can confirm that a quote is authorized without publishing confidential costs. Buyer-side evaluation can check a private ceiling without telling merchants its value.

Because the platform operates the infrastructure, it may still be technically capable of accessing data. Do not call it cryptographically blind or fully private unless the actual design supports that claim. Policies, access controls, auditability, and business incentives all matter. Supporting external merchant agents later could reduce dependence on the platform's default agent, while adding verification and compatibility work.

FTC staff research describes systems capable of using personal information to influence prices and product presentation. Keeping buyer ceilings and unnecessary personal context private is therefore part of the value proposition, although the exact price effect of disclosing a budget here remains unmeasured. [FTC staff research, January 2025](https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2025/01/surveillance-pricing-update-work-ahead)

## 11. A quote must survive the path to purchase

Keep five states distinct: **offer, stock hold, buyer approval, merchant order, and payment**. None automatically proves the next.

An initial quote may use current advertised availability and an estimated destination-dependent total. It must be labeled accordingly. After selection, verify exact goods, condition, delivery capacity, shipping, taxes, and other charges. Acquire a short inventory hold where the merchant supports it, and issue a final offer with expiry and a reference to the stock commitment.

The buyer approves those final terms. Payment authorization, order confirmation, capture, release of holds, and refund recovery must follow the actual merchant and processor capabilities. If a material term changes, return to approval. If a step fails, preserve the state and recover without silently substituting goods, charging again, or leaving unnecessary stock holds.

Shopify's documentation explicitly distinguishes stock in a draft order from inventory actually reserved for it. The general lesson is that an agent finding stock is not an inventory commitment. [Draft orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/create-orders/create-draft), [inventory states](https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states)

For the initial model, the merchant can remain the identified seller and fulfillment provider while the platform owns request matching and comparison. State who supports the buyer, handles returns, and resolves exceptions. Taking responsibility for an entire multi-merchant bundle or holding funds in escrow is a larger commercial and legal design choice, not a feature implied by one checkout screen.

Visa's documented agent-specific tokens and authenticated payment instructions can support approval of the selected merchant and bounded payment. They do not verify stock, guarantee delivery, or create escrow. Sponsor access and supported scopes remain unverified for this team. [Visa Intelligent Commerce](https://github.com/visa/ai/wiki/Visa-Intelligent-Commerce)

## 12. Revenue and merchant economics

My initial preference is a transparent charge tied to completed orders, with optional paid merchant automation later. It avoids charging every merchant merely for participating in a request, but it is a hypothesis to test, not a universally superior business model.

| Model | Benefit | Tension |
|---|---|---|
| Pay per lead or bid | Revenue before a sale. | Can reward enquiry volume and low-quality demand; sellers pay even when the buyer does not purchase. |
| Completed-order fee | Revenue depends on a transaction. | Encourages bypass, creates refund-fee questions, and can bias the platform toward higher order values. Define the fee base and refund treatment. |
| Merchant subscription | Predictable revenue for automation. | Hard to justify before useful demand; may favor merchants able to pay. A subscription must not buy hidden recommendation priority. |
| Buyer membership or fee | Clearer direct buyer relationship. | Adds adoption friction and needs recurring value or trusted protection. |

**Illustrative unit economics, not a claim about typical retailer margins:** On an $800 order, suppose goods cost $650, fulfillment $20, payment/service costs $20, after-sales allowance $20, and the marketplace fee is 5% of the price ($40). The merchant retains $50 before general overhead. Cutting the price to $750 with those other costs unchanged leaves $2.50 after the percentage fee. A seemingly modest discount can consume almost all of the contribution.

Consequently, the platform must prove incremental profitable orders or lower acquisition/quotation effort. It cannot rely indefinitely on sellers sacrificing margin to make agent competition look impressive.

## 13. Where to start and how it could scale

Start with one concrete shopping market even if engineering resources are unlimited. This is a way to establish useful supply and interpretable offers, not a limit on the vision.

| Starting category | Why it fits | Main complication |
|---|---|---|
| Refurbished laptops and accessories | Meaningful spend; structured specifications; condition, warranty, and availability create real differences. | Exact unit condition, battery evidence, compatibility, and merchant margin need verification. |
| Local furniture with delivery | Large service and deadline differences; possible inventory-specific offers. | Fit, access, transport, assembly, and returns can dominate the economics. |
| Exact-model electronics | Easy offer comparison and clear hard constraints. | Limited differentiation when everyone already publishes a competitive price. |
| Groceries | Frequent use and meaningful household need. | Low order contribution, substitutions, perishability, and delivery economics make it a harder first mechanism test. |
| Custom services | Quote-based buying is familiar. | Strong incumbents and assessment-dependent scope complicate instant commitments. |

I recommend **refurbished laptops and simple single-merchant bundles in one service region** as the illustrative first market. This is a product judgment, not a validated finding about demand or margins. New laptops, accessories, furniture, business purchasing, and cross-merchant combinations can follow when evidence supports them.

At larger scale, create a common request and offer format, merchant policy services, default and external agents, interoperable fulfillment/payment connectors, and localized matching. Match category, service area, condition, quantity, and deadline before starting expensive negotiations. A million registered sellers do not solve the absence of three relevant sellers for a particular request.

Likely defensibility would come from merchant relationships, reliable integrations, fulfilled-offer history, and trust in the rules. The model provider or number of agents alone is an easily copied advantage.

## 14. The demonstration and validation plan

**Demonstration:** A buyer enters the university-laptop request. Three merchant agents, each with visibly different inventory and policy, create offers. A cheap late-delivery offer is correctly excluded. The buyer changes a preference; explain the resulting tradeoff. A merchant declines a request because it cannot meet its own limits. The selected offer is reserved, approved, and passed into a clearly labeled payment/order flow. Inject an inventory or network failure and show honest recovery without an unauthorized substitute or duplicate purchase.

The buyer view should be calm: a request summary, a progress indication, and a few clear offers. Merchant and technical views can show private decision explanations to their authorized audience. A stream of bots arguing is not necessary for the buyer and can obscure whether an offer is useful.

**Research before claiming product-market fit:** Collect real buying needs and have actual merchants quote them under their actual rules. Ask merchants what the agent is allowed to change and whether the sale is still attractive after fees. Ask buyers whether the process saves enough effort to justify waiting. Compare against ordinary shopping and a simple catalog-matching baseline. Examine repeat merchant participation after the novelty wears off.

| Hypothesis | Useful measure | What would challenge it |
|---|---|---|
| Requests attract useful competition | Number of feasible, distinct offers per request and time to first one. | Most requests get zero or one relevant response. |
| Agents improve the offer | Outcome and manual effort versus a rules/catalog baseline. | Results reproduce posted prices with extra waiting and no useful terms. |
| Merchants benefit | Contribution after fees, quotation time, fulfilled incremental orders, repeated participation. | Sellers disable agents or only use the platform to clear unprofitable requests. |
| Buyers benefit | Comparison effort, completion rate, satisfaction, and equivalent delivered cost. | Users use quotes as leverage elsewhere or find ordinary shopping easier. |
| Offers are reliable | Checkout price changes, reservation failures, cancellations, delivered-as-promised orders. | Winning quotes regularly disappear or materially change. |
| Users trust the exchange | Understanding of who represents whom, fee/ranking comprehension, consent errors. | People feel manipulated after learning the platform supplies merchant agents. |

Do not measure savings against the buyer's maximum budget. Use a documented contemporaneous comparison with equivalent item, condition, delivery, protection, and fees. Do not measure technical success by agent-message counts.

## 15. Fit with Visa's judging rubric

| Criterion | Strongest expression of the concept | Evidence the demonstration needs |
|---|---|---|
| Innovation — 25% | A buyer need triggers independently authorized merchant offers. | A useful bundle or concession beyond ordinary fixed-price search; honest differentiation from existing RFQs. |
| User experience — 25% | State the need once, understand a small set of complete options, approve clearly. | A real task completed with less effort, including no-match and changed-offer cases. |
| Technical execution — 20% | Reliable requirement understanding, merchant policy enforcement, offer comparison, reservation, and order state. | Live or clearly labeled test integrations; reproducible behavior under failures. |
| Commerce impact — 15% | Profitable incremental sales and less quotation/research work. | Merchant contribution and actual fulfilled outcomes, not assumed discounts. |
| Trust and responsibility — 15% | Private limits, independent merchant control, transparent ranking, bounded spending authority. | Inspectable data access, approved terms preserved through checkout, and clear seller/support responsibility. |

## Evidence limits and conclusion

This report uses current official product pages, public enforcement/research documents, and two selected firsthand discussions. Competitor product claims were not independently tested. Historical procurement findings illustrate mechanisms; they do not establish consumer-market performance. Forum accounts are nonrepresentative and unverified. There are no original buyer interviews, merchant commitments, measured market-size estimates, or live payment tests behind this concept yet.

The core direction is sound enough to investigate: let buyers initiate a well-specified opportunity and let merchants respond intelligently. The make-or-break question is whether the exchange repeatedly produces several offers that buyers want and merchants can profitably honor. That evidence is more important than making the bidding visually dramatic.

**TLDR:** Develop BuyerUnion as a market for complete, purchase-ready offers, using private bids, optional bounded improvements, merchant-controlled policies, and buyer approval. This report expands the buyer and merchant journeys, incentive conflicts, competitor comparison, execution model, economics, and validation plan using primary sources. Demand, merchant willingness, comparative advantage, and Visa access remain unverified. Next, test real laptop requests with several merchants and measure feasible offers, honored terms, buyer effort, and merchant contribution.
