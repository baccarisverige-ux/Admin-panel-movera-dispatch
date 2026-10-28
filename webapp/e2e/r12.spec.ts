import { expect, test } from "@playwright/test";
test("R12 incident timeline persists and safety rules survive reload",async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem("movera-admin-session","erik");localStorage.setItem("movera-admin-activity",String(Date.now()));});
 await page.goto("/incidents"); await page.getByRole("button",{name:"Take",exact:true}).click(); await page.locator(".modal.open").getByRole("button",{name:"Confirm"}).click(); await expect(page.getByRole("heading",{name:"INC-1 · Taken"})).toBeVisible();
 await page.getByLabel("Contact or outcome").fill("Participant confirmed safe"); await page.getByRole("button",{name:"Solve",exact:true}).click(); await page.locator(".modal.open").getByRole("button",{name:"Confirm"}).click(); await expect(page.getByRole("heading",{name:"INC-1 · Solved"})).toBeVisible(); await page.reload(); await expect(page.getByText(/resolve: Participant confirmed safe/)).toBeVisible();
 await page.goto("/risk"); await page.getByLabel("Impossible travel (m/s)").fill("60"); await page.getByRole("button",{name:"Save safety rules"}).click(); await page.locator(".modal.open").getByRole("button",{name:"Confirm"}).click(); await expect(page.getByText("Saved in demo.")).toBeVisible(); await page.reload(); await expect(page.getByLabel("Impossible travel (m/s)")).toHaveValue("60");
});
