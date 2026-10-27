// The app has no test ids, so roles/placeholders are used where available, Angular component tags otherwise
export const BookCartLocators: Record<string, string> = {

    // Nav bar
    "NAV_BAR": "app-nav-bar",
    "CART_BADGE": "app-nav-bar mat-icon:has-text('shopping_cart') .mat-badge-content",
    "SEARCH_BAR": "[placeholder='Search books or authors']",
    "SEARCH_OPTION": "role=option",

    // Login
    "USERNAME": "[placeholder='Username']",
    "PASSWORD": "[placeholder='Password']",
    "LOGIN_BUTTON": "mat-card-actions >> role=button[name='Login']",
    "FIELD_ERROR": "mat-error",
    "GO_TO_REGISTER": "mat-card-header >> role=button[name='Register']",
    "ACCOUNT_MENU": "app-nav-bar a.mat-mdc-menu-trigger",
    "LOGOUT": "role=menuitem[name='Logout']",

    // Registration
    "FIRST_NAME": "[placeholder='First name']",
    "LAST_NAME": "[placeholder='Last Name']",
    "REGISTER_USERNAME": "[placeholder='User name']",
    "CONFIRM_PASSWORD": "[placeholder='Confirm Password']",
    "GENDER_MALE": "input[type=radio][value='Male']",
    "GENDER_FEMALE": "input[type=radio][value='Female']",
    "REGISTER_BUTTON": "mat-card-actions >> role=button[name='Register']",
    "GO_TO_LOGIN": "mat-card-header >> role=button[name='Login']",
    "FORM_TITLE": "mat-card-title >> nth=0",

    // Catalog and details
    "BOOK_CARD": "app-book-card",
    // Cover link: its hover tooltip opens beside it and can cover the text title link
    "BOOK_CARD_LINK": "role=link[name='Book title']",
    "NO_BOOKS": "text=No books found.",
    "BOOK_DETAILS": "app-book-details",
    "ADD_TO_CART": "role=button[name='Add to Cart']",
    "PRICE_SLIDER": "role=slider",
    "SIMILAR_BOOKS": "app-similarbooks",
    // The heart is a plain clickable <span>, not a button (no role to target)
    "WISHLIST_TOGGLE": "app-addtowishlist .material-icons",
    "WISHLIST_BADGE": "app-nav-bar mat-icon:has-text('favorite') .mat-badge-content",

    // Shopping cart
    "CART": "app-shoppingcart",
    "CART_ROW": "app-shoppingcart tr.mat-mdc-row",
    "CART_QUANTITY": ".mat-column-quantity",
    "CART_LINE_TOTAL": ".mat-column-total",
    "INCREASE_QUANTITY": "button:has-text('add_circle')",
    "DECREASE_QUANTITY": "button:has-text('remove_circle')",
    "REMOVE_ITEM": "button:has-text('delete')",
    "CLEAR_CART": "role=button[name='Clear cart']",
    "CART_TOTAL": "app-shoppingcart td:has-text('Cart Total:') + td",
    "CART_SPINNER": "app-shoppingcart >> role=progressbar",
    "EMPTY_CART": "text=Your shopping cart is empty.",
    "CHECKOUT_BUTTON": "role=button[name='CheckOut']",

    // Checkout
    "NAME": "[placeholder='Name']",
    "ADDRESS_LINE_1": "[placeholder='Address Line 1']",
    "ADDRESS_LINE_2": "[placeholder='Address Line 2']",
    "PINCODE": "[placeholder='Pincode']",
    "STATE": "[placeholder='State']",
    "PLACE_ORDER": "role=button[name='Place Order']",
    "ORDER_SUMMARY": "app-checkout",
    "CANCEL_CHECKOUT": "role=button[name='Cancel']",

    // My Orders
    "MY_ORDERS": "app-my-orders",
    "ORDER_SEARCH": "app-my-orders input",
    "ORDERS_PAGINATOR": "app-my-orders mat-paginator",

    // Wishlist
    "WISHLIST_ROW": "app-wishlist tr.mat-mdc-row",
    "REMOVE_FROM_WISHLIST": "role=button[name='Remove from Wishlist']",
    "CLEAR_WISHLIST": "role=button[name='Clear Wishlist']",
    "EMPTY_WISHLIST": "text=Your wishlist is empty.",

    // Common
    "SNACKBAR": "mat-snack-bar-container"

};
