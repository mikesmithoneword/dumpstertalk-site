/* ==========================================================
   MERCH STORE SETTINGS  (Fourthwall Storefront API)

   These two values are all the site needs. Both are safe to have
   in public code: the storefront token is read-only and can only
   see products you have published.

   If both are blank, the Merch section falls back to the
   "Drop incoming" placeholder tiles.

   Where to find them:
     storefrontToken - Fourthwall dashboard, Settings > For developers
                       > Storefront API > Create token
     shopDomain      - your shop address, without https://
   ========================================================== */
window.DT_STORE = {
  storefrontToken: "ptkn_5609a703-9f8f-4daa-bbbe-18befc16348b",

  shopDomain: "dumpster-talk-shop.fourthwall.com",

  // Which Fourthwall collection to show.
  // "all" = every published product, newest first.
  // Change this to a collection slug (e.g. "tees") to show only that one.
  collection: "all"
};
