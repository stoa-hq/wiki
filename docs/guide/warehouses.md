# Warehouses & Stock Management

Stoa supports multi-warehouse inventory management. Products can have stock distributed across multiple physical locations, and stock is automatically deducted when orders are created.

## Key Concepts

### Warehouses

A warehouse represents a physical storage location. Each warehouse has:

- **Name** and **Code** — human-readable identifier and unique machine code
- **Priority** — determines which warehouse stock is deducted from first (lower = higher priority)
- **Address** — optional physical address fields
- **Active flag** — inactive warehouses are excluded from stock calculations

### Warehouse Stock

Stock is tracked per product (or product variant) per warehouse. The `warehouse_stock` table links a product to a warehouse with a quantity. A product can have stock in multiple warehouses simultaneously.

### Denormalized Stock

The `stock` field on `products` and `product_variants` tables is kept as a denormalized aggregate. It always reflects the sum of all active warehouse stock entries. This means existing queries and cart validations continue to work without changes.

### Stock Movements

Every stock change is recorded as a `stock_movement` entry with a type:

| Type | Description |
|------|-------------|
| `sale` | Stock deducted when an order is created |
| `restock` | Stock added back (e.g. new shipment received) |
| `adjustment` | Manual stock correction via admin |
| `return` | Stock restored when an order is cancelled or refunded |

## Stock Deduction

Stock is deducted **at order creation time**, not at payment confirmation. This prevents overselling for asynchronous payment methods.

### Priority-Based Warehouse Selection

When an order is created, Stoa deducts stock from warehouses in priority order:

1. All warehouse stock entries for the product are loaded, ordered by warehouse priority (ascending)
2. Stock is deducted from the highest-priority warehouse first
3. If that warehouse doesn't have enough, the remainder cascades to the next warehouse
4. If total stock across all warehouses is insufficient, the order is cancelled

::: tip Example
Warehouse A (priority 0) has 3 units, Warehouse B (priority 1) has 10 units. An order for 5 units deducts 3 from A and 2 from B.
:::

### Row-Level Locking

The deduction process uses `SELECT ... FOR UPDATE` row-level locking within a single transaction. This prevents race conditions when multiple orders are placed simultaneously.

### Stock Restoration

When an order transitions to `cancelled` or `refunded`, the stock is automatically restored to the original warehouses. Return movements are recorded for the audit trail.

## Default Warehouse

When you first run the warehouse migration, a default warehouse (`DEFAULT`) is created automatically. All existing product stock values are migrated to this warehouse, ensuring backward compatibility.

## Admin Panel

The admin panel includes warehouse management pages:

- **Warehouse list** — view, create, edit, and delete warehouses
- **Warehouse detail** — edit warehouse properties and view/edit stock entries
- **Product stock** — the product detail page shows a stock breakdown per warehouse

Navigate to **Warehouses** in the admin sidebar to manage your inventory locations.

## Plugin Hooks

Plugins can react to warehouse and stock events:

| Hook | Timing | Can cancel? |
|------|--------|-------------|
| `warehouse.before_create` | Before warehouse creation | Yes |
| `warehouse.after_create` | After warehouse creation | No |
| `warehouse.before_update` | Before warehouse update | Yes |
| `warehouse.after_update` | After warehouse update | No |
| `warehouse.before_delete` | Before warehouse deletion | Yes |
| `warehouse.after_delete` | After warehouse deletion | No |
| `warehouse.before_stock_update` | Before manual stock change | Yes |
| `warehouse.after_stock_update` | After manual stock change | No |
| `warehouse.after_stock_deduct` | After order stock deduction | No |

## Next Steps

- [Warehouse API](/api/warehouses) — full API reference for warehouse endpoints
- [Products & Variants](/guide/products) — how products and variants work
- [Orders](/guide/orders) — order lifecycle and status transitions
