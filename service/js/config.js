// Public web config. It is safe to publish: the Firestore rules protect the data.
export const firebaseConfig = {
  apiKey: "AIzaSyC5ZBFZsePZnifMkh9cd2FqUXVAGWsFiQI",
  authDomain: "wishlist-service-39517.firebaseapp.com",
  projectId: "wishlist-service-39517",
  storageBucket: "wishlist-service-39517.firebasestorage.app",
  messagingSenderId: "348921616898",
  appId: "1:348921616898:web:59f175d54d7b2da97f251b"
};
// Guest ticking (no account). Set to false to hide the guest door for everybody. The owner switch (allowGuests) and the rules still apply.
export const GUESTS_ENABLED = true;
