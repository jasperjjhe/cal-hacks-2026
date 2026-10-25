import { useState } from 'react';
import { money } from './inventory.ts';
import { SearchBox } from './ui.tsx';

type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';

type Order = {
	id: string;
	placedAt: string;
	buyer: string;
	product: string;
	sku: string;
	quantity: number;
	total: number;
	status: OrderStatus;
};

// Dummy orders for the prototype; there is no order feed yet.
const orders: Order[] = [
	{
		id: 'NC-10482',
		placedAt: '2026-10-24T15:12:00',
		buyer: 'Buyer agent · Elaine C.',
		product: 'Framework Laptop 13',
		sku: 'FW-13-A',
		quantity: 1,
		total: 1299,
		status: 'pending',
	},
	{
		id: 'NC-10481',
		placedAt: '2026-10-24T11:47:00',
		buyer: 'Buyer agent · Marcus T.',
		product: 'Desk Kit Pro',
		sku: 'DK-PRO',
		quantity: 2,
		total: 598,
		status: 'pending',
	},
	{
		id: 'NC-10479',
		placedAt: '2026-10-23T18:05:00',
		buyer: 'Buyer agent · Priya S.',
		product: 'Framework Laptop 12',
		sku: 'FW-12-C',
		quantity: 1,
		total: 899,
		status: 'shipped',
	},
	{
		id: 'NC-10476',
		placedAt: '2026-10-23T09:30:00',
		buyer: 'Buyer agent · Jordan L.',
		product: 'Standing Desk Frame',
		sku: 'SD-FR-01',
		quantity: 1,
		total: 449,
		status: 'shipped',
	},
	{
		id: 'NC-10471',
		placedAt: '2026-10-22T14:22:00',
		buyer: 'Buyer agent · Sam K.',
		product: 'Framework Laptop 13',
		sku: 'FW-13-A',
		quantity: 3,
		total: 3597,
		status: 'delivered',
	},
	{
		id: 'NC-10468',
		placedAt: '2026-10-21T16:58:00',
		buyer: 'Buyer agent · Avery R.',
		product: '4K Monitor Arm',
		sku: 'MA-4K-01',
		quantity: 2,
		total: 258,
		status: 'cancelled',
	},
	{
		id: 'NC-10463',
		placedAt: '2026-10-20T10:14:00',
		buyer: 'Buyer agent · Noah W.',
		product: 'Desk Kit Pro',
		sku: 'DK-PRO',
		quantity: 1,
		total: 299,
		status: 'delivered',
	},
	{
		id: 'NC-10459',
		placedAt: '2026-10-19T13:40:00',
		buyer: 'Buyer agent · Mia H.',
		product: 'Framework Laptop 16',
		sku: 'FW-16-B',
		quantity: 1,
		total: 1799,
		status: 'delivered',
	},
	{
		id: 'NC-10455',
		placedAt: '2026-10-18T08:51:00',
		buyer: 'Buyer agent · Leo P.',
		product: 'Standing Desk Frame',
		sku: 'SD-FR-01',
		quantity: 2,
		total: 858,
		status: 'delivered',
	},
];

const statusLabels: Record<OrderStatus, string> = {
	pending: 'Awaiting shipment',
	shipped: 'Shipped',
	delivered: 'Delivered',
	cancelled: 'Cancelled',
};

const filters: { key: OrderStatus | 'all'; label: string }[] = [
	{ key: 'all', label: 'All' },
	{ key: 'pending', label: 'Awaiting shipment' },
	{ key: 'shipped', label: 'Shipped' },
	{ key: 'delivered', label: 'Delivered' },
	{ key: 'cancelled', label: 'Cancelled' },
];

function placed(at: string) {
	return new Date(at).toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

export default function Orders() {
	const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
	const [query, setQuery] = useState('');

	const q = query.trim().toLowerCase();
	const visible = orders.filter(
		(o) =>
			(filter === 'all' || o.status === filter) &&
			(!q || `${o.id} ${o.product} ${o.sku} ${o.buyer}`.toLowerCase().includes(q))
	);

	return (
		<div className="su-orders">
			<h1 className="su-page-title">Orders</h1>
			<p className="su-lede"></p>
			<div className="su-toolbar su-orders-toolbar">
				<SearchBox
					value={query}
					onChange={setQuery}
					placeholder="Search orders, products or SKUs"
				/>
				<div className="su-filter" role="radiogroup" aria-label="Filter by status">
					{filters.map((f) => (
						<button
							key={f.key}
							type="button"
							role="radio"
							aria-checked={filter === f.key}
							className={filter === f.key ? 'is-active' : undefined}
							onClick={() => setFilter(f.key)}
						>
							{f.label}
						</button>
					))}
				</div>
			</div>

			<section className="su-panel su-inventory-panel is-list" aria-label="Orders">
				{visible.length === 0 ? (
					<p className="su-empty su-inventory-empty">No orders match.</p>
				) : (
					<table className="su-table su-orders-table">
						<thead>
							<tr>
								<th scope="col">Order</th>
								<th scope="col">Product</th>
								<th scope="col">Qty</th>
								<th scope="col">Total</th>
								<th scope="col">Status</th>
								<th scope="col" className="is-end">
									Placed
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((o) => (
								<tr key={o.id}>
									<td>
										<div className="su-row-product">
											<span>
												<strong>{o.id}</strong>
												<small>{o.buyer}</small>
											</span>
										</div>
									</td>
									<td>
										<div className="su-row-product">
											<span>
												<strong>{o.product}</strong>
												<small>{o.sku}</small>
											</span>
										</div>
									</td>
									<td className="su-row-stock">{o.quantity}</td>
									<td className="su-row-price">{money(o.total)}</td>
									<td>
										<span className={`su-order-status is-${o.status}`}>
											{statusLabels[o.status]}
										</span>
									</td>
									<td className="is-end su-row-stock">{placed(o.placedAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}
