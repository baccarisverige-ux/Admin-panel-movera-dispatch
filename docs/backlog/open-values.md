# Open product values

The field is built and saved in configuration. The number below is the default until the owner decides. Do not invent a second default in a screen.

| Topic | Default in the demo | Why it is open |
| --- | --- | --- |
| Quote validity | 2 minutes | Rider app has not confirmed the window. |
| Free cancellation window | Set per zone and car type in Dispatch › Rides & stops › Rider cancel fees | The fee after it is set in the same card. |
| Reservation give-up | 5 minutes | Driver app timer must match. |
| Included reservation waiting | 5 minutes | Extra waiting price is a price-set field. |
| Booking horizon | 7 days | May differ by zone. |
| Assignment lead | 30 minutes | When a reservation is offered to drivers. |
| Refund second-person threshold | 200 kr (20000 öre) | Finance may raise it. |
| Wallet credit ceiling per action | 500 kr | Support limit, not a balance edit. |
| Wallet top-up amounts | 100, 200, 500 kr | Rider app shows these today. |
| Impossible travel | 55 m/s | Risk alert, not a ban by itself. |
| Offer window | 8.5 seconds | Dispatch default per zone. |
| Search radius | 30 km | Dispatch default per zone. |
| Max stops | 3 | Booking rule. |
| Trusted contacts | 5 | Safety setting. |
| Acceptance / cancellation window | last 100 requests | Which cancel reasons count is still open. |
| Support sticky owner | 3 days | Auto-assign may replace it. |
| Idle sign-out | 15 minutes | Security setting. |
| Session code | 6 digits, labelled demo | Real SMS is backend work. |
| App languages | Swedish and English | Apps are English-only today. |
| Google Maps key | empty | Owner adds `VITE_GOOGLE_MAPS_KEY`. Until then the map is OpenStreetMap plus drawing on our own layer. |

Out of this repository (do not block Gate A): real OTP, real payouts, rider and driver sync, production refusal of demo data on the public apps.
