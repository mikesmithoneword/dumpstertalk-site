/* ==========================================================
   MERCH STORE SETTINGS  (Shopify Buy Button + Printful)

   Until you fill these in, the site shows a "drop incoming" preview grid.
   Once you do, the live store appears in the Merch section automatically.

   Where to find each value: see START-HERE.md, Part 3 (the merch store).
   ========================================================== */
window.DT_STORE = {
  // e.g. "dumpster-talk.myshopify.com"
  domain: "",

  // Storefront access token from the Shopify "Buy Button" embed code.
  // (If your embed code shows "apiKey" and "appId" instead, fill in
  //  apiKey / appId below and leave this one empty.)
  storefrontAccessToken: "",
  apiKey: "",
  appId: "",

  // The numeric ID of the collection (or product) you want to show
  collectionId: "",

  // "collection" shows a grid of everything in that collection.
  // Use "product" if collectionId is really a single product ID.
  componentType: "collection",

  // How prices are displayed. This one shows "$25.00 CAD".
  // Encoded form of  ${{amount}} CAD   (change CAD to USD if you price in USD)
  moneyFormat: "%24%7B%7Bamount%7D%7D%20CAD"
};
