import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways at phone width").toBeLessThanOrEqual(0);
}

test("car details → free verdict → mock checkout → report → reply coach", async ({ page }) => {
  // 1. Enter car details.
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await page.getByRole("tab", { name: "Type it in" }).click();
  await page.getByLabel("Year").fill("2017");
  await page.getByLabel("Make").fill("Honda");
  await page.getByLabel("Model").fill("Civic");
  await page.getByLabel("Mileage").fill("84000");
  await page.getByLabel("Asking price").fill("13900");
  await page.getByLabel("Your ZIP code").fill("48104");
  await page.getByRole("button", { name: "Check this car — free" }).click();

  // 2. Free verdict; paid sections are locked.
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]{22}$/);
  await expect(page.getByRole("heading", { level: 1, name: "2017 Honda Civic" })).toBeVisible();
  await expect(page.getByText("Fair range near 48104")).toBeVisible();
  await expect(page.getByText(/Overpriced: about \$|Fair price|Suspiciously cheap/)).toBeVisible();
  const locked = page.getByRole("list", { name: "Included in the Deal Kit" }).getByRole("listitem");
  await expect(locked).toHaveCount(6);
  for (const row of await locked.all()) await expect(row.getByText("Unlock")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 3. Mock checkout.
  await page.getByRole("button", { name: "Get my Deal Kit — $29" }).click();
  await expect(page).toHaveURL(/\/checkout\/mock\//);
  await expect(page.getByText("Test mode.")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByLabel(/Email for your Deal Kit/).fill("buyer@example.com");
  await page.getByRole("button", { name: "Pay $29 (test)" }).click();

  // 4. Report page shows all 7 sections.
  await expect(page).toHaveURL(/\/report\/[A-Za-z0-9_-]{22}$/);
  for (const title of [
    "Verdict",
    "Your numbers",
    "Scam check",
    "Red flags for this model",
    "Messages to send the seller",
    "Meetup and payment checklist",
    "Next step",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 5. Reply coach returns a message.
  await page.getByLabel("Seller’s latest message").fill("Price is firm, I have other people interested.");
  await page.getByRole("button", { name: "Write my reply" }).click();
  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByText("Your reply")).toBeVisible();
  await expect(conversation.getByText(/The most I can do is \$|I'd like to see the car/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});
