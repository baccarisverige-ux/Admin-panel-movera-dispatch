# Audit phase 5: every screen and control (admin panel)

Branch `audit/phase-5-admin`. Two builds exist: the **live** build (`VITE_ADMIN_API` set, signs in to the Movera server)
and the **demo** build (data kept in the browser). Status words: **tested** = a Playwright test drives the control and
checks the result; **demo-tested** = covered by the existing demo e2e suite (`npm run e2e`), not against a server;
**not live** = in a live build the page is hidden from the menu and shows "Demo, not live" (sv/fr/en) when opened by
its address; **n/a** = not applicable.

Live tests run with `npm run e2e:live` (`playwright.live.config.ts`, faked server answering every call with
`page.route`): `e2e/live-people.spec.ts` (existing), `e2e/live-trips.spec.ts` and `e2e/live-controls.spec.ts` (new).

## Live screens

| Screen | Server calls | Controls | Action | Repeat click | Loading / empty / error | Form validation | sv / fr | 390 px |
|---|---|---|---|---|---|---|---|---|
| Sign-in | `POST /admin/auth/sign-in` | E-mail, Password, Sign in, Forgot password | tested | tested (one request) | wrong password tested | empty fields send nothing (tested) | n/a (before sign-in the build language applies) | not tested |
| First password `/setup-password#token=` | `POST /admin/auth/setup-password/check`, `/setup-password` | Password, Repeat, Save | tested | tested | dead link tested | mismatch tested; ≥ 10 chars by the browser and the server | not tested | not tested |
| Landing `/` | — | redirect | tested (first live page the admin may read; **fixed**, was "No access") | n/a | n/a | n/a | n/a | n/a |
| Menu (live) | — | links | tested: only Trips, Drivers, Fleet owners, Vehicles, Onboarding | n/a | n/a | n/a | tested | tested (via pages) |
| Trips `/trips` (**new**) | `GET /admin/trips` | tabs All / Active / Completed / Cancelled, search, row open, Load more | tested | Load more sends one page (tested) | tested (loading, empty, error + Retry) | n/a | tested | tested |
| Trip `/trips/{id}` (**new**) | `GET /admin/trips/{id}`, `/offers` | Drivers link, Refund | tested (id, status, rider, driver, car, route, money, fare lines, timeline, offers; 404) | n/a | trip 404 tested; offers empty tested | n/a | tested | tested |
| Refund dialog (**new**) | `POST /admin/trips/{id}/refund` | Amount, Reason, Refund, Cancel | tested (201 and 202 pending approval; hidden without `payments.refund` or on an unpaid trip) | tested (double click = one POST, Idempotency-Key) | server error shown in the dialog | amount > 0, ≤ fare, reason required (tested) | button tested | not tested |
| Drivers `/drivers` | `GET /admin/drivers` | tabs, search, row open, Load more | tested | n/a | tested (loading, error + Retry, empty) | n/a | tested | tested |
| Driver `/drivers/{id}` | `GET /admin/drivers/{id}`, `POST …/status`, documents | Activate / Put on hold / Suspend, documents Open / Approve / Reject | tested | status: tested (one POST) | stale version tested | note required (tested) | not tested | tested |
| Onboarding `/onboarding` | `GET /admin/drivers?accountStatus=on_hold` | as Drivers | tested (open) | n/a | as Drivers | n/a | not tested | tested |
| Fleet owners `/fleets` | `GET /admin/fleets` | tabs, search, row open | tested | n/a | not tested | n/a | menu tested | tested |
| Fleet `/fleets/{id}` | `GET /admin/fleets/{id}`, review, code, invitations, remove | Copy code, New code, Approve/Reject/Block, invitation Accept/Cancel, Remove from fleet, vehicle review | tested | not tested (dialogs share the guarded `DecisionDialog`) | refusal on a trip, expired invitation tested | note rules in `DecisionDialog` | not tested | not tested |
| Vehicles `/vehicles`, `/vehicles/{id}` | `GET /admin/vehicles`, review | row unfold, documents, Approve/Reject | tested | not tested | not tested | n/a | not tested | tested |
| Sign out | `POST /admin/auth/sign-out` | Sign out | tested | n/a | n/a | n/a | n/a | n/a |

## Demo pages (not live)

Each is hidden from the live menu and, opened by its address in a live build, carries the "Demo, not live" banner
(tested for Payments, Zones, Riders in en; Payments in sv and fr; Payments at 390 px). Their controls are covered by the
demo suite only.

| Page | Path | Demo e2e specs |
|---|---|---|
| Dashboard | `/` (live: redirects) | dashboard, a1-security, a2-functional, … |
| Reports | `/reports` | reports, reports-extra, r17, operations |
| Handover | `/handover` | operations |
| Alerts | `/alerts` | alerts, a2-functional, reports |
| Reservations | `/reservations` | reservations, r11, r3ops, dashboard |
| Live map | `/live` | live, operations, r08, r18 |
| Dispatch | `/dispatch` | dispatch, r3-assign, r2-settings, surge-quick, … |
| Radar · Exclusive · Reservations | `/offers` | dispatch, r08 |
| Incidents | `/incidents` | r12, r18, ridecheck, operations |
| Risk | `/risk` | r12, ridecheck, operations |
| Riders | `/riders` | riders, r07, sign-in |
| Payments | `/payments` | payments, finance, r10, wave-a |
| Payouts | `/payouts` | finance, r10, r3ops |
| Zones | `/zones` | zones, touch-draw |
| Pricing | `/pricing` | r09, wave-a, a2-functional |
| Support | `/support` | support |
| Chat | `/chat` | chat |
| Messages | `/messages` | messages, growthops |
| Content | `/content` | content, growthops |
| Promotions | `/promotions` | growthops |
| Reviews | `/reviews` | growth, growthops |
| Team | `/team` | platform, a1-security |
| Audit | `/audit` | platform, r10 |
| Settings | `/settings` | config, platform, r2-settings |
| To confirm | `/confirm` | platform, live |
| System | `/system` | platform, system |
| Release gates | `/gates` | none (unit tests in `src/gates`) |
| Design | `/design` | none |

## Refunds page: blocked on the server

The contract lists `GET /admin/refunds` (cursor list, `operationId: adminListRefunds`), but the server
(`movera-server/src/admin/tripRoutes.ts`) does not serve it. It serves `GET /admin/refunds/payouts` and
`POST /admin/refunds/{refundId}/paid`, which are **not** in the contract. A live Refunds list is therefore not built;
refunds are made from the trip (`POST /admin/trips/{id}/refund`, in both). Needed: the server implements
`GET /admin/refunds`, or the contract adds the payouts queue, then the panel page.

## Not covered here

- Network timeout (as opposed to an error answer) is not simulated; the live client has no request timeout of its own.
- Large text and keyboard-open states are device checks (rider/driver apps); the admin is a desktop/browser tool.
- Reopening restores the screen: the address is the state (tabs and search live in the URL) and the session stays in
  sessionStorage; not separately tested.
