import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, addDoc, deleteDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// Add a style block to hide the number input arrows
const customStyles = `
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
`;

// Define a placeholder for the Firebase config
let firebaseConfig = null;

// Use a self-executing function to safely parse the config
(() => {
  try {
    if (typeof __firebase_config !== 'undefined') {
      firebaseConfig = JSON.parse(__firebase_config);
    } else {
      console.warn('__firebase_config is not defined. Using a placeholder.');
      // Fallback for local development or if not in the Canvas environment
      firebaseConfig = {
        apiKey: "AIzaSyA4id5rldiv9oLlPRYHp89CJvyrNJ3NPV4",
        authDomain: "truck-payment-record.firebaseapp.com",
        projectId: "truck-payment-record",
        storageBucket: "truck-payment-record.firebasestorage.app",
        messagingSenderId: "646930084187",
        appId: "1:646930084187:web:bc4df27c97ea6e470f6a7e"
      };
    }
  } catch (e) {
    console.error("Failed to parse __firebase_config", e);
    // You might want to handle this more gracefully
  }
})();


// Main App component
const App = () => {
  // State variables for transactions, and Firebase status
  const [transactions, setTransactions] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [userId, setUserId] = useState('');
  const [isAppReady, setIsAppReady] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [selectedChallan, setSelectedChallan] = useState(null); // New state for selected challan
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState('dashboard'); // State for navigation

  // Inject custom CSS to hide number input arrows
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = customStyles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  // Initialize Firebase and Auth
  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config is not available. Cannot initialize Firebase.");
      return;
    }
    console.log("Initializing Firebase...");
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);
      console.log("Firebase initialized.");
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setIsAppReady(false);
    }
  }, []);

  // Manage Authentication State
  useEffect(() => {
    if (auth) {
      console.log("Setting up auth state listener...");
      const unsubscribeFromAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          console.log("onAuthStateChanged: User is signed in. UID:", user.uid);
          setUserId(user.uid);
          setIsAppReady(true);
        } else {
          console.log("onAuthStateChanged: No user, attempting sign-in...");
          try {
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            if (initialAuthToken) {
              console.log("Signing in with custom token...");
              await signInWithCustomToken(auth, initialAuthToken);
            } else {
              console.log("Signing in anonymously...");
              await signInAnonymously(auth);
            }
          } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            setIsAppReady(false);
          }
        }
      });
      return () => unsubscribeFromAuth();
    }
  }, [auth]);

  // Fetch Firestore data after auth is ready
  useEffect(() => {
    let unsubscribeFromFirestore = () => {};
    if (db && userId) {
      console.log("Setting up Firestore listener for user:", userId);
      try {
        const appId = firebaseConfig.projectId;
        const transactionsCollection = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
        const q = query(transactionsCollection);
  
        unsubscribeFromFirestore = onSnapshot(q, (snapshot) => {
          const transactionList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          // Sort transactions by timestamp in descending order
          transactionList.sort((a, b) => {
            const timestampA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
            const timestampB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
            return timestampB - timestampA;
          });
          setTransactions(transactionList);
          console.log("Transactions updated:", transactionList.length);
        }, (error) => {
          console.error("Error fetching transactions:", error);
        });
      } catch (error) {
        console.error("Error setting up Firestore listener:", error);
      }
    }
    return () => unsubscribeFromFirestore();
  }, [db, userId]);

  // Helper function to handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAppReady || !editingTransaction) return;

    const appId = firebaseConfig.projectId;

    const data = {
      ...editingTransaction,
      date: new Date(editingTransaction.date),
      timestamp: serverTimestamp(),
      amount: parseFloat(editingTransaction.amount),
    };

    try {
      if (editingTransaction.id) {
        // Update an existing transaction
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, editingTransaction.id);
        await updateDoc(docRef, data);
        console.log("Document successfully updated!");
      } else {
        // Add a new transaction
        const transactionsCollection = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
        await addDoc(transactionsCollection, data);
        console.log("Document successfully written!");
      }
      setEditingTransaction(null);
    } catch (e) {
      console.error("Error adding/updating document: ", e);
    }
  };

  // Function to prepare a new transaction
  const handleNewTransaction = (type) => {
    setEditingTransaction({
      id: '',
      type,
      truckNumber: '',
      challanNumber: '',
      date: new Date().toISOString().substring(0, 10),
      amount: 0,
      description: '',
    });
    setSelectedTruck(null);
    setSelectedChallan(null);
  };

  // Function to set up editing for an existing transaction
  const handleEdit = (transaction) => {
    setEditingTransaction({
      ...transaction,
      date: transaction.date?.toDate()?.toISOString().substring(0, 10) || '',
    });
    setSelectedTruck(null);
    setSelectedChallan(null);
  };

  // Function to delete a transaction
  const handleDelete = (transaction) => {
    setTransactionToDelete(transaction);
    setIsModalOpen(true);
  };

  const handleDeleteTransaction = async () => {
    if (!isAppReady || !transactionToDelete) return;
    const appId = firebaseConfig.projectId;

    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/transactions`, transactionToDelete.id));
      console.log("Document successfully deleted!");
      setIsModalOpen(false);
      setTransactionToDelete(null);
    } catch (e) {
      console.error("Error removing document: ", e);
    }
  };

  const closeDeleteModal = () => {
    setIsModalOpen(false);
    setTransactionToDelete(null);
  };

  // Helper function for rendering the table
  const renderTransactionTable = (data, title, showDelete) => {
    if (data.length === 0) {
      return (
        <p className="text-center text-gray-500 dark:text-gray-400 mt-4">No records found for '{title}'.</p>
      );
    }
    return (
      <div className="overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg shadow-inner mt-4 p-2">
        <table className="min-w-full table-auto">
          <thead>
            <tr className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-sm leading-normal">
              <th className="py-3 px-6 text-left">Date</th>
              <th className="py-3 px-6 text-left">Type</th>
              <th className="py-3 px-6 text-left">Truck No.</th>
              <th className="py-3 px-6 text-left">Challan No.</th>
              <th className="py-3 px-6 text-left">Amount</th>
              <th className="py-3 px-6 text-left">Description</th>
              <th className="py-3 px-6 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 dark:text-gray-200 text-sm font-light">
            {data.map((transaction) => (
              <tr key={transaction.id} className="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                <td className="py-3 px-6 text-left whitespace-nowrap">{transaction.date?.toDate()?.toLocaleDateString()}</td>
                <td className="py-3 px-6 text-left">{transaction.type}</td>
                <td className="py-3 px-6 text-left">{transaction.truckNumber}</td>
                <td className="py-3 px-6 text-left">{transaction.challanNumber}</td>
                <td className="py-3 px-6 text-left">₹{Math.round(transaction.amount)}</td>
                <td className="py-3 px-6 text-left">{transaction.description}</td>
                <td className="py-3 px-6 text-center">
                  <div className="flex item-center justify-center">
                    <button
                      onClick={() => handleEdit(transaction)}
                      className="w-4 mr-2 transform hover:scale-110"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {showDelete && (
                      <button
                        onClick={() => handleDelete(transaction)}
                        className="w-4 mr-2 transform hover:scale-110"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Group transactions by truck number
  const groupTransactionsByTruck = (transactions) => {
    return transactions.reduce((acc, curr) => {
      const truckNo = curr.truckNumber.toUpperCase().trim();
      if (!acc[truckNo]) {
        acc[truckNo] = [];
      }
      acc[truckNo].push(curr);
      return acc;
    }, {});
  };

  // Group transactions by challan number
  const groupTransactionsByChallan = (transactions) => {
    return transactions.reduce((acc, curr) => {
      const challanNo = curr.challanNumber.toUpperCase().trim();
      if (!acc[challanNo]) {
        acc[challanNo] = [];
      }
      acc[challanNo].push(curr);
      return acc;
    }, {});
  };

  const groupedByTruck = groupTransactionsByTruck(transactions);
  const truckNumbers = Object.keys(groupedByTruck).sort();

  const groupedByChallan = groupTransactionsByChallan(transactions);
  const challanNumbers = Object.keys(groupedByChallan).sort();

  // Calculate totals for the dashboard
  const calculateTotals = (transactions) => {
    let paymentGiven = 0;
    let paymentReceived = 0;
    let commission = 0;

    transactions.forEach(t => {
      if (t.type === 'Payment Given') {
        paymentGiven += t.amount;
      } else if (t.type === 'Payment Received') {
        paymentReceived += t.amount;
      } else if (t.type === 'Commission Details') {
        commission += t.amount;
      }
    });

    return { paymentGiven, paymentReceived, commission };
  };

  const allTotals = calculateTotals(transactions);
  const filteredTransactions = transactions.filter(t => {
    const searchMatch = searchQuery === '' ||
      t.truckNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.challanNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const filterMatch = filterType === 'all' || t.type === filterType;
    return searchMatch && filterMatch;
  });

  // Main UI
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6">
          <h1 className="text-3xl font-bold mb-2 sm:mb-0">Truck Payments Record - Advance and Commissions</h1>
        </header>

        {/* User ID Display */}
        {userId && (
          <div className="text-sm text-gray-400 dark:text-gray-500 mb-4 break-all">
            User ID: <span className="font-mono">{userId}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex justify-center space-x-2 mb-6">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              currentPage === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('allRecords')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              currentPage === 'allRecords' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
            }`}
          >
            All Records
          </button>
          <button
            onClick={() => setCurrentPage('challanRecords')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              currentPage === 'challanRecords' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
            }`}
          >
            Challan Records
          </button>
          <button
            onClick={() => setCurrentPage('truckRecords')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              currentPage === 'truckRecords' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
            }`}
          >
            Truck Records
          </button>
        </div>

        {/* Loading/Error State */}
        {!isAppReady && (
          <div className="flex justify-center items-center h-48">
            <p className="text-gray-500 dark:text-gray-400">
              Initializing app...
            </p>
          </div>
        )}

        {/* Transaction Form */}
        {isAppReady && editingTransaction && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <h2 className="text-2xl font-semibold mb-4 capitalize">{editingTransaction.id ? `Edit ${editingTransaction.type}` : `Add ${editingTransaction.type}`}</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div className="flex flex-col">
                  <label htmlFor="date" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                  <input
                    type="date"
                    id="date"
                    value={editingTransaction.date || ''}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, date: e.target.value })}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    required
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="truckNumber" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Truck Number</label>
                  <input
                    type="text"
                    id="truckNumber"
                    placeholder="e.g., PB10AB1234"
                    value={editingTransaction.truckNumber || ''}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, truckNumber: e.target.value })}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    required
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="challanNumber" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Challan Number</label>
                  <input
                    type="text"
                    id="challanNumber"
                    placeholder="e.g., #12345"
                    value={editingTransaction.challanNumber || ''}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, challanNumber: e.target.value })}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    required
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="amount" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
                  <input
                    type="number"
                    id="amount"
                    placeholder="0"
                    value={editingTransaction.amount || ''}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: e.target.value })}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    required
                  />
                </div>
                <div className="flex flex-col sm:col-span-2">
                  <label htmlFor="description" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Description (Optional)</label>
                  <input
                    type="text"
                    id="description"
                    placeholder="e.g., Fuel, Repair, etc."
                    value={editingTransaction.description || ''}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, description: e.target.value })}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
                  disabled={!isAppReady}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold rounded-lg shadow-md transition-colors"
                  disabled={!isAppReady}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Main Content Sections */}
        {isAppReady && !editingTransaction && (
          <>
            {/* Add New Transaction Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-2xl font-semibold mb-4">Add New Transaction</h2>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-2 sm:space-y-0 sm:space-x-2">
                    <button
                    onClick={() => handleNewTransaction('Payment Given')}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg shadow-md transition-colors w-full sm:w-auto"
                    >
                    Add Payment Given
                    </button>
                    <button
                    onClick={() => handleNewTransaction('Payment Received')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition-colors w-full sm:w-auto"
                    >
                    Add Payment Received
                    </button>
                    <button
                    onClick={() => handleNewTransaction('Commission Details')}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg shadow-md transition-colors w-full sm:w-auto"
                    >
                    Add Commission
                    </button>
                </div>
            </div>

            {/* Render different pages based on currentPage state */}
            {currentPage === 'dashboard' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-2xl font-semibold mb-4">Dashboard Overview</h2>
                <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg shadow-inner">
                  <h3 className="text-xl font-medium mb-2">Total Balances</h3>
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between items-center py-2 px-4 bg-orange-200 dark:bg-orange-800 rounded-lg">
                      <span className="text-lg font-medium text-orange-900 dark:text-orange-100">Payments Given</span>
                      <span className="text-xl font-bold text-orange-900 dark:text-orange-100">₹{Math.round(allTotals.paymentGiven)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 px-4 bg-green-200 dark:bg-green-800 rounded-lg">
                      <span className="text-lg font-medium text-green-900 dark:text-green-100">Payments Received</span>
                      <span className="text-xl font-bold text-green-900 dark:text-green-100">₹{Math.round(allTotals.paymentReceived)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 px-4 bg-indigo-200 dark:bg-indigo-800 rounded-lg">
                      <span className="text-lg font-medium text-indigo-900 dark:text-indigo-100">Commissions</span>
                      <span className="text-xl font-bold text-indigo-900 dark:text-indigo-100">₹{Math.round(allTotals.commission)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'allRecords' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-2xl font-semibold mb-4">All Records</h2>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 space-y-4 sm:space-y-0 sm:space-x-4">
                  <input
                    type="text"
                    placeholder="Search by truck or challan number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-1/3 p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full sm:w-auto p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Types</option>
                    <option value="Payment Given">Payment Given</option>
                    <option value="Payment Received">Payment Received</option>
                    <option value="Commission Details">Commission Details</option>
                  </select>
                </div>
                {filteredTransactions.length > 0 ? (
                  renderTransactionTable(filteredTransactions, 'all', true)
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400">No matching records found.</p>
                )}
              </div>
            )}

            {currentPage === 'challanRecords' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-2xl font-semibold mb-4">Challan Records</h2>
                <div className="flex flex-wrap gap-4">
                  {challanNumbers.length > 0 ? (
                    challanNumbers.map(challan => (
                      <button
                        key={challan}
                        onClick={() => setSelectedChallan(selectedChallan === challan ? null : challan)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          selectedChallan === challan
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                        }`}
                      >
                        {challan}
                      </button>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400">No challan records found.</p>
                  )}
                </div>
                {selectedChallan && (
                  <>
                    <h3 className="text-xl font-semibold mt-6 mb-4">Records for Challan: {selectedChallan}</h3>
                    {renderTransactionTable(groupedByChallan[selectedChallan], 'all', false)}
                  </>
                )}
              </div>
            )}

            {currentPage === 'truckRecords' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h2 className="text-2xl font-semibold mb-4">Truck Records</h2>
                <div className="flex flex-wrap gap-4">
                  {truckNumbers.length > 0 ? (
                    truckNumbers.map(truck => (
                      <button
                        key={truck}
                        onClick={() => setSelectedTruck(selectedTruck === truck ? null : truck)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          selectedTruck === truck
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                        }`}
                      >
                        {truck}
                      </button>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400">No truck records found.</p>
                  )}
                </div>
                {selectedTruck && (
                  <>
                    <h3 className="text-xl font-semibold mt-6 mb-4">Records for Truck: {selectedTruck}</h3>
                    {renderTransactionTable(groupedByTruck[selectedTruck], 'all', false)}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center">
              <h3 className="text-xl font-semibold mb-4">Confirm Deletion</h3>
              <p className="mb-6">Are you sure you want to delete this transaction?</p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={handleDeleteTransaction}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  disabled={!isAppReady}
                >
                  Yes, Delete
                </button>
                <button
                  onClick={closeDeleteModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors"
                  disabled={!isAppReady}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
