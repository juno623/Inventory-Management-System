import express from 'express';
import { createConnection } from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import { body, validationResult } from 'express-validator';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json()); // put once here at the top

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'sombir123',
  database: process.env.DB_NAME || 'inventery',
};

app.get('/health', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    await connection.execute('SELECT 1');
    await connection.end();
    res.json({ status: 'ok', db: true });
  } catch (error) {
    res.status(503).json({ status: 'degraded', db: false, error: error.code || error.message });
  }
});

// ================== DASHBOARD ==================
app.get('/api/dashboard', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);

    // Total Orders
    const [orders] = await connection.execute('SELECT COUNT(*) AS totalOrders FROM orders');

    // Inventory Value using cost_price
    const [inventoryValue] = await connection.execute(`
      SELECT IFNULL(SUM(i.quantity * p.cost_price), 0) AS inventoryValue
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
    `);

    // Pending shipments
    const [pendingShipments] = await connection.execute(`
      SELECT COUNT(*) AS pendingShipments 
      FROM shipments 
      WHERE status = 'pending' OR status = 'processing'
    `);

    // Supplier performance
    const [supplierPerformance] = await connection.execute(`
      SELECT supplier_id, SUM(quantity) AS total_sales
      FROM order_details od
      JOIN products p ON od.product_id = p.product_id
      GROUP BY supplier_id
    `);

    // Top Supplier
    const [topSupplier] = await connection.execute(`
      SELECT p.name, SUM(od.quantity) AS total_sales
      FROM order_details od
      JOIN products p ON od.product_id = p.product_id
      GROUP BY p.name
      ORDER BY total_sales DESC
      LIMIT 1
    `);

    // Inventory Turnover
    const [inventoryTurnover] = await connection.execute(`
      SELECT DATE_FORMAT(o.order_date, '%b') AS month, SUM(od.quantity) AS quantity
      FROM orders o
      JOIN order_details od ON o.order_id = od.order_id
      WHERE o.order_date >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
      GROUP BY month ORDER BY month ASC
    `);

    // Orders vs Shipments
    const [ordersVsShipments] = await connection.execute(`
      SELECT DATE(order_date) AS day,
        COUNT(*) AS orders,
        0 AS shipments
      FROM orders
      GROUP BY day
      ORDER BY day DESC LIMIT 5
    `);

    await connection.end();

    res.json({
      totalOrders: orders[0].totalOrders,
      inventoryValue: inventoryValue[0].inventoryValue,
      pendingShipments: pendingShipments[0].pendingShipments,
      supplierPerformance: supplierPerformance[0].total_sales,
      inventoryTurnover,
      ordersVsShipments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ================== INVENTORY ==================
app.post(
  '/api/inventory',
  [
    body('productId').isInt({ min: 1 }),
    body('warehouse').isString().notEmpty(),
    body('quantity').isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { productId, warehouse, quantity } = req.body;
    try {
      const connection = await createConnection(dbConfig);
      const sql = 'INSERT INTO inventory (product_id, warehouse, quantity) VALUES (?, ?, ?)';
      await connection.execute(sql, [productId, warehouse, quantity]);
      await connection.end();
      res.json({ message: 'Inventory added successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Database insertion failed' });
    }
  }
);

app.get('/api/inventory', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [inventory] = await connection.execute('SELECT * FROM inventory');
    await connection.end();
    res.json(inventory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.put(
  '/api/inventory/:id',
  [
    body('warehouse').isString().notEmpty(),
    body('quantity').isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { warehouse, quantity } = req.body;
    const inventoryId = req.params.id;
    try {
      const connection = await createConnection(dbConfig);
      await connection.execute(
        'UPDATE inventory SET warehouse = ?, quantity = ? WHERE inventory_id = ?',
        [warehouse, quantity, inventoryId]
      );
      await connection.end();
      res.json({ message: 'Inventory updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update inventory' });
    }
  }
);

// ================== ORDERS ==================
app.post(
  '/api/orders',
  [
    body('customerName').isString().notEmpty(),
    body('orderDate').isISO8601(),
    body('status').isString().notEmpty(),
    body('products').isArray({ min: 1 }),
    body('products.*.productId').isInt({ min: 1 }),
    body('products.*.quantity').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { customerName, orderDate, status, products } = req.body;
    let connection;
    try {
      connection = await createConnection(dbConfig);
      await connection.beginTransaction();

      // Validate all productIds exist
      const productIds = products.map((p) => p.productId);
      const placeholders = productIds.map(() => '?').join(',');
      const [existing] = await connection.execute(
        `SELECT product_id FROM products WHERE product_id IN (${placeholders})`,
        productIds
      );
      const existingIds = new Set(existing.map((r) => r.product_id));
      const missingIds = productIds.filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        await connection.rollback();
        await connection.end();
        return res.status(400).json({ error: 'One or more productId do not exist', missing_product_ids: missingIds });
      }

      // Insert order
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (customer_name, order_date, status) VALUES (?, ?, ?)',
        [customerName, orderDate, status]
      );
      const orderId = orderResult.insertId;

      // Insert order details
      for (const item of products) {
        await connection.execute(
          'INSERT INTO order_details (order_id, product_id, quantity) VALUES (?, ?, ?)',
          [orderId, item.productId, item.quantity]
        );
      }

      await connection.commit();
      await connection.end();
      res.json({ message: 'Order and details added successfully', order_id: orderId });
    } catch (error) {
      console.error(error);
      try { if (connection) await connection.rollback(); } catch {}
      try { if (connection) await connection.end(); } catch {}
      res.status(500).json({ error: 'Failed to add order' });
    }
  }
);

app.get('/api/orders', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [orders] = await connection.execute('SELECT * FROM orders');
    await connection.end();
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { customer_name, status } = req.body;
  const orderId = req.params.id;
  try {
    const connection = await createConnection(dbConfig);
    await connection.execute(
      'UPDATE orders SET customer_name = ?, status = ? WHERE order_id = ?',
      [customer_name, status, orderId]
    );
    await connection.end();
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ================== SUPPLIERS ==================
app.post('/api/suppliers', async (req, res) => {
  const { name, contact_info } = req.body;
  try {
    const connection = await createConnection(dbConfig);
    const sql = 'INSERT INTO suppliers (name, contact_info) VALUES (?, ?)';
    await connection.execute(sql, [name, contact_info]);
    await connection.end();
    res.json({ message: 'Supplier added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add supplier' });
  }
});
app.get('/api/suppliers', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [suppliers] = await connection.execute('SELECT * FROM suppliers');
    await connection.end();
    res.json(suppliers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

app.put(
  '/api/suppliers/:id',
  [
    body('name').isString().notEmpty(),
    body('contact_info').isString().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, contact_info } = req.body;
    const supplierId = req.params.id;
    try {
      const connection = await createConnection(dbConfig);
      await connection.execute(
        'UPDATE suppliers SET name = ?, contact_info = ? WHERE supplier_id = ?',
        [name, contact_info, supplierId]
      );
      await connection.end();
      res.json({ message: 'Supplier updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  }
);

// ================== WAREHOUSES ==================
app.get('/api/warehouses', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [warehouses] = await connection.execute(
      'SELECT warehouse, COUNT(*) as item_count FROM inventory GROUP BY warehouse'
    );
    await connection.end();
    res.json(warehouses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
});

app.put('/api/warehouses/:id', async (req, res) => {
  const { name, location } = req.body;
  const warehouseId = req.params.id;
  try {
    const connection = await createConnection(dbConfig);
    await connection.execute(
      'UPDATE warehouses SET name = ?, location = ? WHERE warehouse_id = ?',
      [name, location, warehouseId]
    );
    await connection.end();
    res.json({ message: 'Warehouse updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update warehouse' });
  }
});

// ================== SHIPMENTS ==================
app.get('/api/shipments', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [shipments] = await connection.execute('SELECT * FROM shipments');
    await connection.end();
    res.json(shipments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

// ================== REPORTS ==================
app.get('/api/reports/inventory', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM inventory');
    await connection.end();
    // Convert to CSV
    const header = Object.keys(rows[0] || {}).join(',') + '\n';
    const csv = header + rows.map(r => Object.values(r).join(',')).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('inventory_report.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ================== PRODUCTS ==================
app.post(
  '/api/products',
  [
    body('name').isString().notEmpty(),
    body('description').optional().isString(),
    body('cost_price').isFloat({ gt: 0 }),
    body('supplier_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, description, cost_price, supplier_id } = req.body;
    try {
      const connection = await createConnection(dbConfig);
      let supplierIdToUse = supplier_id ?? null;
      if (process.env.REQUIRE_SUPPLIER_ID === 'true' && (supplierIdToUse === null || supplierIdToUse === undefined)) {
        await connection.end();
        return res.status(400).json({ error: 'supplier_id is required by server policy' });
      }
      if (supplierIdToUse !== null) {
        const [exists] = await connection.execute(
          'SELECT 1 FROM suppliers WHERE supplier_id = ? LIMIT 1',
          [supplierIdToUse]
        );
        if (exists.length === 0) {
          await connection.end();
          return res.status(400).json({ error: 'Invalid supplier_id. Supplier not found.' });
        }
      }
      const sql = 'INSERT INTO products (name, description, cost_price, supplier_id) VALUES (?, ?, ?, ?)';
      await connection.execute(sql, [name, description, cost_price, supplierIdToUse]);
      await connection.end();
      res.json({ message: 'Product added successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to add product', ...(process.env.NODE_ENV !== 'production' && { details: error.message, code: error.code }) });
    }
  }
);

app.get('/api/products', async (req, res) => {
  try {
    const connection = await createConnection(dbConfig);
    const [products] = await connection.execute('SELECT * FROM products');
    await connection.end();
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});