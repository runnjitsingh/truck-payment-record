<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Firebase Debugger</title>
    <!-- Tailwind CSS for styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Inter Font -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
        }
    </style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">

    <div class="container mx-auto max-w-2xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h1 class="text-3xl font-bold text-center mb-6 text-blue-600 dark:text-blue-400">
            Firebase Connection Debugger
        </h1>

        <!-- Status and User ID display -->
        <div class="mb-6 p-4 rounded-lg bg-gray-200 dark:bg-gray-700">
            <h2 class="text-lg font-semibold mb-2">Status</h2>
            <div id="status" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Initializing...
            </div>
            <div id="user-id" class="text-xs text-gray-500 dark:text-gray-400 mt-2 break-all">
                User ID: N/A
            </div>
            <div id="app-id" class="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                App ID: N/A
            </div>
        </div>

        <!-- Add New Transaction Form -->
        <div class="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
            <h2 class="text-2xl font-semibold mb-4 text-center">Add a Test Record</h2>
            <form id="add-form" class="space-y-4">
                <input
                    type="text"
                    id="challanNo"
                    placeholder="Challan No."
                    class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                />
                <input
                    type="number"
                    id="amount"
                    placeholder="Amount"
                    class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                />
                <textarea
                    id="notes"
                    placeholder="Notes"
                    rows="3"
                    class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                ></textarea>
                <button
                    type="submit"
                    id="submit-btn"
                    class="w-full font-bold py-2 px-4 rounded-lg shadow-md transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                >
                    Add Record
                </button>
            </form>
        </div>

        <!-- Real-time Records List -->
        <div class="mt-8">
            <h2 class="text-2xl font-bold mb-4 text-center">Current Records</h2>
            <div id="records-list" class="space-y-4">
                <p class="text-center text-gray-500 dark:text-gray-400">Listening for data...</p>
            </div>
        </div>
    </div>

    <!-- Firebase SDK Scripts -->
    <script type="module">
        // Import Firebase modules
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

        // Global variables for Firebase instances
        let db;
        let auth;
        let userId;
        let appId;
        let isAuthReady = false;

        const statusDiv = document.getElementById('status');
        const userIdDiv = document.getElementById('user-id');
        const appIdDiv = document.getElementById('app-id');
        const recordsListDiv = document.getElementById('records-list');
        const form = document.getElementById('add-form');

        // Function to update the status in the UI
        function updateStatus(message) {
            statusDiv.textContent = message;
        }

        // Initialize Firebase and set up authentication
        async function initFirebase() {
            updateStatus("Initializing Firebase...");

            try {
                // Hardcoded Firebase config from the user's project
                const firebaseConfig = {
                    apiKey: "AIzaSyAdgjFY9QpgXQYCrcjbyN6EUjMV-Y3WM_o",
                    authDomain: "truck-payment-record-27b18.firebaseapp.com",
                    projectId: "truck-payment-record-27b18",
                    storageBucket: "truck-payment-record-27b18.firebasestorage.app",
                    messagingSenderId: "670987953173",
                    appId: "1:670987953173:web:cc28a9ea277bd0c2af5a1c"
                };

                const app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);

                // Get app ID from the canvas environment or use a default
                appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
                appIdDiv.textContent = `App ID: ${appId}`;

                // Check for the custom auth token first
                const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                    updateStatus("Signed in with custom token.");
                } else {
                    await signInAnonymously(auth);
                    updateStatus("Signed in anonymously.");
                }

                // Listen for auth state changes and set up the Firestore listener
                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        userId = user.uid;
                        userIdDiv.textContent = `User ID: ${userId}`;
                        isAuthReady = true;
                        updateStatus("Authentication successful. Ready to load and save data.");
                        setupFirestoreListener();
                    } else {
                        updateStatus("Authentication failed.");
                        isAuthReady = false;
                        userIdDiv.textContent = "User ID: N/A";
                    }
                });

            } catch (error) {
                console.error("Firebase initialization failed:", error);
                updateStatus("Error: Firebase initialization failed. See console.");
            }
        }

        // Set up the real-time listener for the transactions collection
        function setupFirestoreListener() {
            if (!isAuthReady || !db || !userId) {
                // Return if not ready
                return;
            }

            const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);

            onSnapshot(transactionsCollectionRef, (snapshot) => {
                recordsListDiv.innerHTML = '';
                if (snapshot.docs.length === 0) {
                    recordsListDiv.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400">No records found.</p>';
                    return;
                }

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const recordDiv = document.createElement('div');
                    recordDiv.className = 'p-4 bg-gray-200 dark:bg-gray-700 rounded-lg shadow-sm';
                    recordDiv.innerHTML = `
                        <p class="font-semibold text-lg">Challan No: ${data.challanNo || 'N/A'}</p>
                        <p>Amount: ₹${data.amount || 0}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-400">Notes: ${data.notes || 'N/A'}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">ID: ${doc.id}</p>
                    `;
                    recordsListDiv.appendChild(recordDiv);
                });
            }, (error) => {
                console.error("Error listening to collection:", error);
                updateStatus("Error: Failed to fetch data. Check database rules.");
            });
        }

        // Handle form submission to add a new document
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!isAuthReady) {
                updateStatus("Error: Not authenticated. Please wait for the app to initialize.");
                return;
            }

            const challanNo = document.getElementById('challanNo').value;
            const amount = parseInt(document.getElementById('amount').value);
            const notes = document.getElementById('notes').value;

            if (!challanNo || !amount) {
                updateStatus("Please fill in both Challan No. and Amount.");
                return;
            }

            const newRecord = {
                challanNo,
                amount,
                notes,
                date: new Date().toISOString().split('T')[0],
                type: 'payment_given',
                createdAt: serverTimestamp()
            };

            try {
                await addDoc(collection(db, `artifacts/${appId}/users/${userId}/transactions`), newRecord);
                updateStatus("Record added successfully!");
                form.reset();
            } catch (error) {
                console.error("Error adding document:", error);
                updateStatus("Error: Failed to save data. See console for details.");
            }
        });

        // Start the app on window load
        window.onload = initFirebase;
    </script>

</body>
</html>
