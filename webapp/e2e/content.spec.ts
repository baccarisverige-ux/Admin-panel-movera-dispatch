import {expect,test} from "@playwright/test";
test("R15 content draft persists with second-agent publication gate",async({page})=>{await page.addInitScript(()=>{localStorage.setItem("movera-admin-session","nora");localStorage.setItem("movera-admin-activity",String(Date.now()));});await page.goto("/content");await page.getByLabel("Swedish content").fill("Hej");await page.getByLabel("English content").fill("Welcome");await page.getByRole("button",{name:"Save draft"}).click();await page.locator(".modal.open").getByRole("button",{name:"Confirm"}).click();await expect(page.getByText("driver-home: save recorded.")).toBeVisible();await expect(page.getByRole("button",{name:"Publish",exact:true})).toBeDisabled();await page.reload();await expect(page.getByLabel("English content")).toHaveValue("Welcome");await page.getByLabel("Content slot").selectOption("help");await expect(page.getByLabel("English content")).toHaveValue("");});

// Moved from the old content/book.ts phonePreview test (C-21): the phone preview shows the text being written.
test("the phone preview shows the draft text", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("movera-admin-session", "nora");
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
  await page.goto("/content");
  await page.getByLabel("English content").fill("Reserve for the match.");
  const preview = page.getByRole("complementary", { name: "Phone preview" });
  await preview.getByRole("radiogroup", { name: "Preview language" }).getByText("English").click();
  await expect(preview).toContainText("Reserve for the match.");
});
