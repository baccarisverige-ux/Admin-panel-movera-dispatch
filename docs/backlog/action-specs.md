# ActionSpec backlog

Every business button gets one row. Owner is the phase that must ship it. Acceptance is what the demo must show. Status starts `open`.

Currency is SEK in öre. Time zone is Europe/Stockholm. Ids match the apps (`tripId`, 18 trip statuses, 7 category ids).

| Id | Action | Permission | Owner | Acceptance |
| --- | --- | --- | --- | --- |
| admin.session.signIn | Sign in with email, password and a 6-digit code | public | P2 | Wrong code is refused. Right code opens the role's menu. |
| admin.session.signOut | Sign out, including idle | session | P2 | Cache and scope clear. Next URL asks for sign-in. |
| admin.team.invite | Invite an agent | team.edit | P2 | Invite appears as pending. A deactivated agent cannot sign in. |
| admin.team.role | Change an agent's role | team.edit | P2 | Menu and buttons match the new role after refresh. |
| admin.command.run | Run any command with an idempotency key and expected version | per action | P3 | Double click and a retry share one result. 409 shows the new version. |
| admin.audit.read | Read the audit log | audit.read | P3 | Who, what, when, before, after, reason. Reveals and denials are included. |
| admin.approval.decide | Approve or refuse a queued action | approval.decide | P3 | The requester cannot approve their own item. |
| admin.zone.draw | Create or edit a zone polygon | zones.edit | P4 | Greater Stockholm zones save as a draft. |
| admin.zone.publish | Publish or roll back zones | zones.publish | P4 | A second agent publishes. Rollback restores the previous polygons. |
| admin.config.draft | Save a settings draft | settings.edit | P5 | Draft is not live. |
| admin.config.publish | Publish, schedule or roll back configuration | settings.publish | P5 | One zone can differ. History keeps every version. |
| admin.feature.set | Turn a feature on or off per app | settings.edit | P5 | `luxury` is not a feature. |
| admin.reason.edit | Edit a reason code | settings.edit | P5 | Codes match Appendix A. Missing translation is warned. |
| admin.driver.reviewDoc | Accept or reject a driver document | drivers.review | P6 | Rejection includes a reason the driver can be shown. |
| admin.driver.setStatus | Set pending, active, on_hold, suspended | drivers.edit | P6 | Suspended driver gets no new offers. On-trip rule is stated. |
| admin.vehicle.review | Review vehicle papers and eligibility | drivers.review | P6 | Electric category refuses a non-electric vehicle. |
| admin.rider.block | Block or unblock a rider | riders.edit | P7 | Reason is required and audited. |
| admin.rider.signOut | Sign a rider out of all devices | riders.edit | P7 | Session list is cleared in the simulation. |
| admin.rider.privacy | Open a privacy request | privacy.edit | P7 | Request moves new → processing → done. |
| admin.trip.cancel | Cancel a trip as admin, with an admin_* reason code | trips.intervene | P8 | Allowed in every non-terminal status (contract v0.3.0 transitions). Terminal trips stay disabled. |
| admin.trip.offer | Offer to one eligible driver (assign) | trips.intervene | P8 | requested, searching, offered → offered. The driver still accepts. Ineligible drivers are not offered. |
| admin.trip.reassign | Take the trip off its driver | trips.intervene | P8 | offered … arrived → searching (back to dispatch); then offer it. |
| admin.trip.noShow | Mark the rider no-show | trips.intervene | P8 | accepted, driver_to_pickup, arrived → no_show. |
| admin.trip.complete | Complete a stuck trip | trips.intervene | P8 | rider_onboard, in_trip, approaching_dropoff → completed. |
| admin.trip.adjust | Adjust a fare inside the allowed percent | trips.adjust | P8 | Rule version is shown on the receipt. |
| admin.dispatch.save | Save dispatch rules for one zone | dispatch.edit | P8 | Offer window 8.5 s and radar 30 km are editable. |
| admin.price.save | Save a price set | pricing.edit | P9 | Quote preview uses the same formula as the rider. |
| admin.quote.preview | Preview a quote on the map | pricing.read | P9 | Pickup, per km, per min, min and max match the saved set. |
| admin.payment.set | Enable or disable a payment method | payments.edit | P10 | Change applies to new checkouts only. |
| admin.refund.decide | Approve a refund | payments.refund | P10 | 200 kr or more needs a second agent. Retry does not double-pay. |
| admin.wallet.credit | Credit a rider wallet inside the limit | payments.edit | P10 | Ledger gains one line. Balance is not a typed field. |
| admin.payout.mark | Mark a payout paid | payments.payout | P10 | Bank details still in review cannot be paid. |
| admin.reservation.assign | Assign or unassign a reservation | reservations.edit | P11 | Under 60 minutes without a driver is flagged. |
| admin.reservation.cancel | Cancel a reservation | reservations.edit | P11 | Policy version on the booking does not change. |
| admin.incident.take | Take and close an SOS | safety.edit | P12 | Location time is shown. PIN is never shown. |
| admin.safety.save | Save PIN, RideCheck and driving-hour rules | safety.edit | P12 | Impossible-travel threshold stays configurable (default 55 m/s). |
| admin.ticket.reply | Reply on a support thread | support.reply | P13 | Reply hits one thread. Private notes are not delivered. |
| admin.ticket.assign | Claim or assign a ticket | support.assign | P13 | Sticky owner lasts 3 days in the simulation. |
| admin.message.test | Send a test message | messages.send | P14 | Only the chosen audience is listed as delivered. |
| admin.message.publish | Publish or cancel a message | messages.publish | P14 | Accepted, sent, delivered and failed are separate. |
| admin.content.publish | Publish home, events, banners, help or legal | content.publish | P15 | Phone preview uses the typed template. Rollback restores the previous text. |
| admin.promo.save | Save a rider promotion | growth.edit | P16 | Stacking and budget limits are enforced. |
| admin.bonus.save | Save a driver bonus | growth.edit | P16 | ARN120, EVE60 and PEAK80 keep their rules. |
| admin.review.moderate | Hide a review with a reason | growth.moderate | P16 | Original text is kept. The average is recomputed. |
| admin.report.export | Export a report as CSV | reports.export | P17 | Cells that start with =, + or - are prefixed so a spreadsheet will not run them. |
| admin.scope.set | Change the zone scope | session | P4 | The choice is in the URL and filters lists. |

Ratings, acceptance and cancellation are read-only. No ActionSpec types them in.
