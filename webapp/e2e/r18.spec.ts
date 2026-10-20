import {expect,test} from "@playwright/test";
test("R18 keyboard tabs and confirmation dialog focus",async({page})=>{await page.addInitScript(()=>{localStorage.setItem("movera-admin-session","nora");localStorage.setItem("movera-admin-activity",String(Date.now()));});await page.goto("/drivers/D0001");const tabs=page.getByRole("tab");await tabs.first().focus();await page.keyboard.press("ArrowRight");await expect(tabs.nth(1)).toHaveAttribute("aria-selected","true");await page.keyboard.press("Home");await expect(tabs.first()).toHaveAttribute("aria-selected","true");await page.goto("/incidents");const take=page.getByRole("button",{name:"Take",exact:true});await take.click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog.getByLabel("Reason",{exact:true})).toBeFocused();await page.keyboard.press("Shift+Tab");await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(take).toBeFocused();});
for(const width of [390,768,1024,1440])test(`R18 responsive evidence ${width}`,async({page},testInfo)=>{await page.setViewportSize({width,height:900});await page.addInitScript(()=>{localStorage.setItem("movera-admin-session","nora");localStorage.setItem("movera-admin-activity",String(Date.now()));});await page.goto("/content");await expect(page.getByRole("heading",{name:"Content",level:2,exact:true})).toBeVisible();await expect(page.getByRole("button",{name:/^Alerts, \d+ open$/})).toBeInViewport();if(width<=1280)await page.getByRole("button",{name:"More options",exact:true}).click();await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);await testInfo.attach(`content-${width}`,{body:await page.screenshot({fullPage:true}),contentType:"image/png"});});

test("R18 unavailable graphics preserve operational controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("movera-admin-session", "nora");
    localStorage.setItem("movera-admin-activity", String(Date.now()));
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(original, {
      apply(target, canvas, args) {
        if (String(args[0]).includes("webgl")) return null;
        return Reflect.apply(target, canvas, args);
      },
    });
  });
  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "Live map", level: 2 })).toBeVisible();
  await expect(page.getByText(/Map unavailable. WebGL/)).toBeVisible();
  await expect(page.getByTestId("dispatch-link")).toContainText("Norrmalm");
  expect(errors).toEqual([]);
});
