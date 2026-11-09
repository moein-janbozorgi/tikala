# Project Architecture & Engineering Guidelines

## 1. Project Context

We are building a real-world e-commerce store with a small initial scale and a long-term goal of gradual business growth.

The project currently uses:

- **Framework:** Next.js 16
- **Language:** TypeScript
- **Frontend:** React 19
- **Styling:** Tailwind CSS 4
- **Database:** Turso (libSQL) using `@libsql/client`
- **File Storage:** Vercel Blob
- **Image Processing:** Sharp
- **Payment Gateway:** Zarinpal
- **Authentication:** SMS-based login
- **Hosting:** Vercel
- **Testing:** Node.js built-in test runner

The frontend and backend are part of a single Next.js application. There is no separate backend project.

## 2. Architectural Strategy

Use a **Modular Monolith Architecture**.

- Keep the frontend and backend inside the same Next.js codebase.
- Do not introduce microservices or a separate backend unless there is a clear business or technical requirement.
- Keep business logic modular, reusable, and independent of UI components.
- Separate responsibilities between UI, application logic, database access, and external services.
- Design the architecture to support gradual growth without unnecessary complexity.

## 3. Code Organization

Organize the project around clear business domains:

- Authentication
- Products
- Categories
- Shopping Cart
- Orders
- Payments
- Inventory
- Customers
- Administration
- File Storage

Keep database operations, business logic, validation, and UI components properly separated.

Use:
- Server Components for server-side data fetching.
- Server Actions for appropriate application mutations.
- Route Handlers for APIs, payment callbacks, and webhooks.
- Shared components for reusable UI.
- Centralized validation and error handling.

Avoid duplicated business logic and oversized files.

## 4. Database & Data Integrity

Continue using Turso/libSQL unless a concrete limitation justifies migration.

Critical requirements:

- Use proper database transactions for operations involving multiple related changes.
- Prevent overselling through atomic inventory updates.
- Handle concurrent purchases safely.
- Ensure order creation and inventory updates remain consistent.
- Use unique identifiers and idempotency protections for critical operations.
- Design reliable database migrations.
- Add appropriate indexes and optimize frequently used queries.
- Never trust prices, totals, or inventory values submitted by the client.
- Keep database access on the server.

Consider Drizzle ORM if it improves query organization, type safety, and maintainability without creating unnecessary migration risk.

## 5. Payment Security

Zarinpal integration must follow these rules:

- Calculate all payment amounts on the server.
- Verify every payment through the official payment verification process.
- Never trust client-side payment success messages.
- Mark orders as paid only after successful server-side verification.
- Prevent duplicate payment processing.
- Handle failed, cancelled, expired, and pending payments correctly.
- Store payment references and transaction identifiers.
- Maintain a clear relationship between orders and payments.

## 6. Authentication & Security

- Protect all administrative operations with server-side authorization.
- Validate permissions on every sensitive Server Action and API endpoint.
- Implement SMS rate limiting.
- Validate and sanitize all user inputs.
- Secure sessions and authentication tokens.
- Protect sensitive environment variables.
- Never expose API secrets or database credentials to the browser.
- Apply appropriate security controls to uploads and external requests.

## 7. File & Image Management

Continue using Vercel Blob for persistent product images.

- Never depend on local filesystem storage for persistent production data on Vercel.
- Validate file types and sizes.
- Optimize images using Sharp.
- Generate appropriate image sizes and thumbnails.
- Handle image deletion and replacement safely.
- Prevent unauthorized file uploads.

## 8. Testing & Reliability

Expand the existing Node.js testing setup.

Include tests for:

- Product management
- Authentication and authorization
- Shopping cart calculations
- Order creation
- Inventory consistency
- Concurrent purchases
- Successful and failed payments
- Duplicate payment callbacks
- Database migrations
- Backup and restore procedures

Maintain automated unit, integration, and end-to-end tests.

Never deploy untested critical changes.

## 9. Backup & Monitoring

- Implement automated database backups.
- Define a reasonable backup retention policy.
- Regularly test database restoration.
- Log important business operations.
- Monitor application errors and payment failures.
- Avoid logging passwords, authentication codes, or sensitive customer information.
- Ensure production errors can be diagnosed efficiently.

## 10. Performance & SEO

- Optimize server-side data fetching.
- Use caching where appropriate.
- Avoid unnecessary client-side JavaScript.
- Optimize product images and loading performance.
- Implement proper metadata and structured data for products.
- Maintain SEO-friendly URLs.
- Optimize product pages for search engines.
- Use pagination for large product collections.

## 11. Scalability Strategy

Do not over-engineer the application.

Follow gradual scaling:

1. Start with the current Next.js + Turso + Vercel architecture.
2. Optimize database queries and indexing as traffic increases.
3. Introduce background jobs when asynchronous processing becomes necessary.
4. Improve caching and performance when required.
5. Evaluate PostgreSQL if database requirements or workload outgrow Turso.
6. Consider separating services only when measurable technical requirements justify it.

## 12. Development Rules

Before making architectural changes:

- Inspect the existing codebase.
- Understand the current architecture and dependencies.
- Identify existing implementations before creating new ones.
- Preserve working functionality.
- Avoid unnecessary dependency additions.
- Avoid rewriting working modules without a clear reason.
- Use TypeScript strictly and maintain type safety.
- Follow consistent naming and coding conventions.
- Document important architectural decisions.

## 13. Main Objective

Build a secure, maintainable, reliable, and production-ready e-commerce application that:

- Works reliably at a small initial scale.
- Supports gradual business growth.
- Maintains data integrity during purchases and payments.
- Protects customer and administrative data.
- Has predictable deployment and recovery procedures.
- Remains easy to maintain and extend.

**Important:** Prioritize correctness, security, data integrity, and maintainability over architectural complexity. Do not change the existing technology stack unless a specific, measurable technical limitation justifies the change.
