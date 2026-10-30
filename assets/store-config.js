/* ==========================================================
   MERCH STORE SETTINGS  (Fourthwall Storefront API)

   Everything the Merch section needs. All of it is safe to have
   in public code: the storefront token is read-only and can only
   see products you have already published.

   If the token or shop address is blank, the Merch section falls
   back to the "Drop incoming" placeholder tiles.

   Where to find them:
     storefrontToken - Fourthwall dashboard, Settings > For developers
                       > Storefront API > Create token
     shopDomain      - your shop address, without https://
   ========================================================== */
window.DT_STORE = {
  storefrontToken: "ptkn_5609a703-9f8f-4daa-bbbe-18befc16348b",

  shopDomain: "dumpster-talk-shop.fourthwall.com",

  // Which Fourthwall collection to show.
  // "all" = read every collection and show everything, in shop order.
  // Change this to one collection slug (e.g. "tees") to show only that one.
  collection: "all",

  // Prices shown on the site. "USD" or "CAD".
  // Whatever you pick here, the customer can still switch currency
  // at checkout. Note that CAD prices include Fourthwall's exchange
  // rate plus a 2% buffer, so $45 USD shows as roughly $64 CAD.
  currency: "USD",

  // Collections where hovering a product should NOT flip to the second
  // photo. Hats are photographed from several angles rather than
  // front-and-back, so a hover swap just looks like a glitch.
  noBackImage: ["hats"]
};
