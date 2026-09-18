# Construction POS — Point of Sale & Khata system for building-material shops (Pakistan)

A complete, offline-first POS, inventory and accounts system for a construction material store:
cement, saria (steel), bricks & blocks, sand, crush, plumbing, sanitary, tiles, electrical, paint,
chemicals, doors & windows, hardware, wood, roofing, tools and safety items.

It runs on one computer in the shop (the **server**) and is used from any number of counters,
laptops or phones on the same Wi-Fi/LAN through a browser. All terminals share one central database
and update **in real time** — a sale on one counter instantly changes the stock shown on the others.

---

## 1. What it does

**Selling**
- Fast POS screen: search by name/SKU/brand/size, scan a barcode or QR code, or browse by category.
- Sell in multiple units per product with automatic conversion — sand in **CFT / trolley / truck**,
  steel in **KG / ton**, bricks **per piece / per 1000**, pipes **per foot / per length**, tiles
  **per sq ft / per box**.
- Bargaining-friendly: edit the rate or give a line/bill discount; a **minimum price** stops a
  cashier from selling too cheap.
- Delivery charges (kiraya) and labour charges (mazdoori) on the bill.
- Split payment: cash, card, bank transfer, JazzCash, Easypaisa, cheque — with change calculation.
- Hold bills, quotations (estimates) that convert into a sale in one click, delivery challans with
  vehicle and driver.
- Sale returns (full or partial, with or without restocking) and cancellation with full reversal.

**Khata (credit) & customers**
- Complete customer record: name, father/husband name, CNIC, phone, full address, city, NTN.
- Credit sales with credit limits, running balance, payment history and printable statements.
- Payment reminders and receipts on **WhatsApp** (free) or **SMS** (through a gateway).
- Printable **credit agreement for judicial/stamp paper** (English, Urdu or both) with amount,
  due date, instalments, witnesses and a recovery clause.

**Stock & purchases**
- Category → Subcategory → Product, with brand, grade/specification, size, unit, purchase price,
  sale price, wholesale price, stock, minimum stock, supplier, barcode, HS/PCT code and **photo**.
- Purchases (GRN) update stock, weighted-average cost and the supplier ledger; freight is added to
  the landed cost. Purchase returns and cancellation supported.
- Stock adjustments (breakage, wastage, theft, physical count), full stock movement ledger,
  low-stock/reorder list.
- Print your own **barcode / QR labels** for products that have no manufacturer barcode.

**Money & reports**
- Cash book (roznamcha) with day closing and cash-difference tracking.
- Expenses with categories.
- Reports: sales summary, by product / category / customer / salesman, payment methods,
  profit & loss, **stock & profit analysis**, stock valuation, receivables, payables, GST/tax.
- **Zakat** calculator on stock in trade + cash + receivables − liabilities, with saved dated reports.
- Every report exports to CSV and prints.

**Administration**
- Roles: Administrator (owner), Manager, Cashier — cashiers never see cost or profit.
- Activity log, automatic daily database backups, document numbering, GST settings,
  optional **FBR POS integration** for Tier-1 retailers.

---

## 2. Install (shop computer)

You need **Node.js 22 LTS** (https://nodejs.org) on the computer that will act as the server.

```bash
npm install          # install once
npm run build        # build the app
npm run seed:demo    # OPTIONAL: adds demo products/customers so you can try it
npm start            # start the POS server
```

The console prints the addresses, e.g.

```
local:   http://localhost:3000
network: http://192.168.1.10:3000
```

Open the local address on the shop computer, or the network address from any other computer,
tablet or phone on the same network.

**First login:** username `admin`, password `admin123` — the system forces you to set a new
password immediately. (Demo data also creates `cashier` / `cashier123`.)

> Starting with real data instead of demo data: skip `npm run seed:demo`. If you already added demo
> data and want a clean shop, stop the server, delete the `data` folder and run `npm start` again.

### Keep it running

- **Start automatically with Windows:** put a shortcut to `scripts\start-pos.bat` in
  `shell:startup` (press Win+R, type `shell:startup`).
- **Counter shortcut:** `scripts\open-counter.bat` opens the POS in a clean app window
  (Edge/Chrome without tabs or address bar). Edit the IP inside it once.
- Allow Node.js through Windows Firewall the first time Windows asks, otherwise other computers
  cannot connect.

### Configuration (optional)

Copy `.env.example` to `.env` to change anything:

| Setting | Meaning |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DATA_DIR` | Where the database, backups, logs and product images are stored (default `./data`) |
| `TZ_NAME` | Business timezone (default `Asia/Karachi`) |
| `SESSION_HOURS` | How long a login lasts (default 12 hours = one shift) |
| `INITIAL_ADMIN_PASSWORD` | Password for the very first admin user |
| `JWT_SECRET` | Optional; generated automatically and stored in `data/.jwt-secret` |

### HTTPS (needed only for camera scanning on other computers)

Browsers allow camera access only on `localhost` or HTTPS. To scan with a phone/laptop camera
across the LAN:

```bash
npm run cert:generate      # creates data/certs/server.crt and server.key for this PC's IPs
npm start                  # now serves https://<ip>:3000
```

Install `data/certs/server.crt` as a trusted certificate on each counter device (otherwise the
browser shows a warning you must accept). USB/Bluetooth barcode scanners work without HTTPS.

---

## 3. Everyday use

**Making a sale**
1. Open **POS / New Sale**. The search box is always focused — scan a barcode or type a name.
2. Click a product to add 1 base unit, or use the small unit buttons (`+trolley`, `+ton`, `+1000`)
   to add a bigger unit.
3. Set quantity, rate and discount in the cart. Pick a khata customer (F4) for credit sales.
4. Press **Pay (F9)**, take the payment (split it if needed), tick **Delivery required** if the
   material is being sent, and complete the sale.
5. Print the thermal receipt or A4 invoice, print a delivery challan, or send the receipt on
   WhatsApp/SMS.

Keyboard: **F2** search · **F4** customer · **F8** hold bill · **F9** pay · **F10** held bills.

**Credit (udhaar)**
- Pay less than the total (or press *Full credit*) and the balance goes to the customer's khata.
- Customers → open a customer for the ledger, statements, payment history and reminders.
- For large credit, create a **Credit Agreement** and print it on stamp paper.

**End of day**
- **Cash Book** → check the day's cash, count the drawer and press **Close day**. Differences are
  recorded and kept in the closing history.

**Stock**
- **Purchases → New purchase** when material arrives; freight is spread over the items so the
  landed cost (and therefore profit) stays correct.
- **Stock Control** for breakage/wastage/physical count, the full stock ledger, and the reorder list.

---

## 4. Scanning, WhatsApp/SMS, FBR, Zakat

### Barcode & QR scanning
- **USB / Bluetooth scanner (recommended):** it types like a keyboard. Just scan while the POS
  screen is open — the item is added automatically. Works on every computer, no setup.
- **Camera:** press **Camera** on the POS screen (needs `localhost` or HTTPS, see above).
- **Your own labels:** *Barcode / QR Labels* prints Code-128 + QR labels (A4 sticker sheets or
  50×30 mm label rolls) encoding the product barcode, or the SKU when a product has no barcode.

### WhatsApp & SMS receipts
- **WhatsApp** works out of the box and costs nothing: the app prepares the message (items, totals,
  balance) and opens WhatsApp Web/Desktop for the number on file — you press send. Every message is
  logged.
- **SMS** needs an SMS gateway account (any Pakistani provider with an HTTP API). In
  *Settings → WhatsApp & SMS* paste the gateway URL using the `{phone}` and `{message}`
  placeholders, for example:
  `https://api.your-gateway.pk/send?key=YOUR_KEY&to={phone}&text={message}`
  Choose GET or POST, add headers if your provider needs them, then press **Test**.
  You can also auto-send an SMS after every sale or payment.
- Message wording is fully editable in the same screen.

### FBR POS integration (only for Tier-1 retailers)
*Settings → FBR integration*: enable it, choose Sandbox or Production, and enter the **POS ID** and
**access token** issued by FBR. Invoices are posted to FBR when they are completed; if the internet
is down they are queued and retried automatically (and can be retried by hand from the invoice).
The fiscal invoice number and its QR code are printed on the receipt. Each product needs its
**PCT/HS code** filled in.

> This module is built to FBR's documented POS interface but has **not** been tested against a live
> FBR account from here. Validate it with FBR sandbox credentials before going live, and keep it
> switched off if your shop is not a Tier-1 retailer.

### Zakat
*Zakat* calculates zakat on stock in trade (valued at wholesale, retail or cost — your choice),
plus cash and receivables, minus payables, at 2.5% (editable), against the nisab you enter.
Reports are saved with the full stock snapshot of that moment and can be printed.
Zakat rulings differ between scholars — confirm your specific situation with a qualified mufti.

### Credit agreements on stamp paper
*Credit Agreements → New agreement* prints an "Agreement for payment of outstanding amount" /
اقرار نامہ with the customer's CNIC, address, amount in words, due date, instalments, witnesses and
a recovery clause. Paper size (Pakistani legal or A4), the blank space left for the pre-printed
stamp-paper header, the language (English/Urdu/both) and the complete wording are editable in
*Settings → Agreements & Zakat*.

> The supplied wording is a practical starting point, **not legal advice**. Have your lawyer review
> it once, then save your version in settings.

---

## 5. Backups & safety

- A backup of the database is made automatically every day into `data/backups`, and you can press
  **Backup now** in *Settings → Backup* at any time. Old backups are pruned to the number you set.
- **Copy `data/backups` to a USB drive or cloud folder regularly** — a backup on the same computer
  does not protect you from theft, fire or a dead disk.
- To restore: stop the server, replace `data/pos.db` with a backup file (rename it to `pos.db`,
  and delete `pos.db-wal` / `pos.db-shm` if present), then start again.
- Forgot the admin password?
  `npm run admin:reset-password -- admin newpassword123`
- Everything important (sales, cancellations, price changes, stock adjustments, logins) is recorded
  in *Settings → Activity log*.

---

## 6. For developers

### Stack
- **Server:** Node.js 22 + TypeScript + Express 5 + SQLite (better-sqlite3, WAL) + Zod + JWT
  (httpOnly cookie) + pino. Money is stored in **paisa (integers)**; quantities to 3 decimals.
- **Web:** React 18 + TypeScript + Vite + TanStack Query + Tailwind CSS. Live updates over
  Server-Sent Events (`/api/events`).
- **Shared:** one package holds the billing/tax maths, pricing and formatting used by both sides, so
  the cart total on screen is calculated exactly the way the server recalculates it.

### Layout

```
packages/
  shared/   calc (tax, discounts, rounding), pricing, formatting, types, constants
  server/   Express API, SQLite schema + migrations, services, tests
  web/      React POS/back-office, print documents
data/       database, backups, logs, uploaded product images (created at runtime)
```

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | API on :3000 with auto-reload + Vite dev server on :5173 |
| `npm run build` | Type-check and build web + server |
| `npm start` | Run the built server (serves the web app too) |
| `npm test` | Shared unit tests + server integration tests |
| `npm run typecheck` | Type-check all packages |
| `npm run seed:demo` | Insert demo catalogue, customers and suppliers |
| `npm run cert:generate` | Create a self-signed certificate for HTTPS |
| `npm run admin:reset-password -- <user> <password>` | Reset a password from the command line |

### Data model

`Category → Subcategory → Product`, where a product carries brand, grade/specification, size, base
unit, purchase/cost/sale/wholesale/minimum price, stock, minimum stock, supplier, barcode, HS code,
tax rate, image and any number of **alternate units** with conversion factors (`1 trolley = 150 cft`).

Stock is never written directly: every change goes through one service that writes a
`stock_movements` row with the running balance, so the ledger always explains the stock figure.
Customer and supplier balances work the same way through `customer_ledger` / `supplier_ledger`.
Sales, purchases, returns, payments and adjustments each run inside a single SQLite transaction.

### Tests

58 automated tests cover the money-critical paths: tax-inclusive/exclusive maths, discount
allocation and rounding, unit conversion, stock enforcement, credit limits, returns, cancellations,
weighted-average cost, cash book, GST and profit reports, permissions, agreements, Zakat, product
images, WhatsApp/SMS rendering and the real-time event broadcast.

```bash
npm test
```

### Multi-terminal / real-time

Counters do not talk to the database directly; they talk to this server, which owns the single
SQLite file — the standard, safe way to share one database. After any change the server broadcasts
the affected topics over SSE and every open screen refreshes just those queries. SQLite in WAL mode
comfortably handles a shop with several counters; if the business ever outgrows one machine, the
data layer is isolated in `packages/server/src/db` and services.

### Known limitations

- FBR integration is implemented to spec but untested against a live FBR account (see section 4).
- Sale returns are not sent to FBR as credit notes yet.
- The camera scanner needs HTTPS (or localhost); USB scanners have no such restriction.
- SMS requires a third-party gateway; WhatsApp sending is click-to-send (no Business API account
  needed).
