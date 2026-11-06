import {expect,test} from "@playwright/test";
test("R15 content draft persists with second-agent publication gate",async({page})=>{await page.addInitScript(()=>{localStorage.setItem("movera-admin-session","nora");localStorage.setItem("movera-admin-activity",String(Date.now()));});await page.goto("/content");await page.getByLabel("Swedish content").fill("Hej");await page.getByLabel("French content").fill("Bienvenue");await page.getByLabel("English content").fill("Welcome");await page.getByRole("button",{name:"Save draft"}).click();await page.locator(".modal.open").getByRole("button",{name:"Confirm"}).click();await expect(page.getByText("driver-home: save recorded.")).toBeVisible();await expect(page.getByRole("button",{name:"Publish",exact:true})).toBeDisabled();await page.reload();await expect(page.getByLabel("English content")).toHaveValue("Welcome");await page.getByLabel("Content slot").selectOption("help");await expect(page.getByLabel("English content")).toHaveValue("");});

// B7b (owner OK 2026-11-05): the drawn sample is gone (old test archived in the Rules repo); the demo build asks to sign in.
test("the phone preview shows the real app only (demo: sign-in note, no drawn sample)", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("movera-admin-session", "nora");
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
  await page.goto("/content");
  await page.getByLabel("English content").fill("Reserve for the match.");
  const preview = page.getByRole("complementary", { name: "Phone preview" });
  await expect(preview.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
  await expect(preview).not.toContainText("Reserve for the match.");
  await expect(page.getByRole("button", { name: "Sample" })).toHaveCount(0);
});
