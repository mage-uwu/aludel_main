import { newId, plan, type SiteId, type TemplateId } from "./kernel";
import { store } from "./sync";

// A demo team, appended through the same guard as everything else: Mike's and Sandy's
// pools on the pool report, anchored eight days back so the field list opens with one
// task already past due.
export const seed = (): void => {
  store.submit([{ type: "granted", email: store.me.email, role: "admin" }]); // found the team
  const tpl = newId<TemplateId>();
  const anchor = Date.now() - 8 * 86_400_000;
  const sites: [SiteId, string, string, string][] = [[newId(), "Mike Rowan", "14 Elm St", "North loop"], [newId(), "Sandy Alvarez", "9 Beach Rd", "Shore loop"]];
  store.submit([{ type: "signed", template: { id: tpl, version: 1, name: "Pool report", tasks: [
    { key: "clean", title: "Weekly clean", cadence: { every: 1, unit: "week", withinDays: 3 },
      blocks: [{ key: "chlorine", kind: "number", label: "Chlorine tabs added", required: true, min: 0, max: 20 }, { key: "photo", kind: "photo", label: "Photo of the water", required: false }, { key: "notes", kind: "text", label: "Notes", required: false, placeholder: "anything worth flagging" }],
      outcomes: [{ key: "OPEN", label: "OPEN", cost: 1 }, { key: "CLOSED", label: "CLOSED", cost: 1 }, { key: "NO_ACCESS", label: "NO ACCESS", cost: 0 }] },
    { key: "drain", title: "Drain and fill", cadence: { every: 10, unit: "week", withinDays: 21 },
      blocks: [{ key: "litres", kind: "number", label: "Litres added", required: true, min: 0, max: 99999 }],
      outcomes: [{ key: "DONE", label: "DONE", cost: 0 }, { key: "SKIP", label: "SKIP", cost: 0 }] },
  ] } }]);
  store.submit(sites.flatMap(([id, name, address, list]) => [
    { type: "declared" as const, site: { id, client: { name, address, email: `${name.toLowerCase().split(" ")[0]}@client.example` }, services: [] } },
    { type: "bound" as const, site: id, service: { template: tpl, anchor, skips: [], allotments: { clean: 13 }, list } },
  ]));
  store.submit(plan(store.state, anchor, 0));      // the round dispatched last week — now past due
  store.submit(plan(store.state, Date.now(), 7)); // and this week's

};
