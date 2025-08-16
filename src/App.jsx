import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, addDoc, deleteDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { FaTruck, FaFilter, FaPlus, FaSave, FaTrash, FaEdit, FaTimes, FaUser } from 'react-icons/fa';

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

// Main App component
const App = () => {
  // State variables for transactions, and Firebase status
  const [transactions, setTransactions] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [appId, setAppId] = useState('');
  const [userId, setUserId] = useState('');
  const [isAppReady, setIsAppReady] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [selectedView, setSelectedView] = useState('all');
  const [selectedTruck, setSelectedTruck] = useState(null);

  // Group transactions by truck number
  const groupedByTruck = transactions.reduce((groups, transaction) => {
    const truck = transaction.truckNumber;
    if (!groups[truck]) {
      groups[truck] = [];
    }
    groups[truck].push(transaction);
    return groups;
  }, {});

  // Form state
  const [formData, setFormData] = useState({
    date: '',
    description: '',
    amount: '',
    truckNumber: '',
    type: 'income',
    timestamp: null
  });

  // Effect for Firebase initialization and authentication
  useEffect(() => {
    // Add the custom styles to the document head
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = customStyles;
    document.head.appendChild(styleSheet);

    // Function to initialize Firebase
    const initFirebase = async () => {
      let firebaseApp, firestoreDb, firebaseAuth;
      let appConfig, appAuthToken, appIdVar;
      try {
        appConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        appAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        appIdVar = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      } catch (e) {
        console.error("Firebase configuration variables not found or malformed.", e);
        // Do not proceed with Firebase initialization if config is missing
        return;
      }

      if (appConfig) {
        try {
          // Initialize Firebase and get service instances
          firebaseApp = initializeApp(appConfig);
          firestoreDb = getFirestore(firebaseApp);
          firebaseAuth = getAuth(firebaseApp);

          // Set state with initialized services
          setDb(firestoreDb);
          setAuth(firebaseAuth);
          setAppId(appIdVar);

          // Authenticate user
          if (appAuthToken) {
            try {
              await signInWithCustomToken(firebaseAuth, appAuthToken);
            } catch (error) {
              console.error("Custom token sign-in failed, trying anonymous.", error);
              await signInAnonymously(firebaseAuth);
            }
          } else {
            // Fallback to anonymous sign-in if no custom token is available
            await signInAnonymously(firebaseAuth);
          }

          // Set up auth state change listener
          const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
            if (user) {
              setUserId(user.uid);
              setIsAuthReady(true);
            } else {
              setUserId('');
              setIsAuthReady(true);
            }
          });
          return unsubscribe;
        } catch (e) {
          console.error("Firebase initialization failed.", e);
        }
      }
    };

    const unsubscribe = initFirebase();
    return () => {
      // Clean up the stylesheet and the auth listener on component unmount
      document.head.removeChild(styleSheet);
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Effect for Firestore data fetching
  useEffect(() => {
    // Only proceed if auth and db are ready
    if (db && isAuthReady && userId) {
      const transactionsCollection = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
      
      const q = query(transactionsCollection);

      // Set up real-time listener for the transactions collection
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const transactionList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Ensure timestamp is a valid Date object for sorting
          timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null
        }));
        
        // Sort transactions by date, newest first
        const sortedList = transactionList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        setTransactions(sortedList);
        setIsAppReady(true);
      }, (error) => {
        console.error("Error fetching transactions: ", error);
        // Still allow app to be "ready" to show UI, but with no data
        setIsAppReady(true);
      });

      return () => unsubscribe();
    } else if (isAuthReady) {
      // If auth is ready but no userId (e.g., user signed out), make the app ready but with no data
      setIsAppReady(true);
      setTransactions([]);
    }
  }, [db, isAuthReady, appId, userId]);

  // Handle input changes for the form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission (add/update transaction)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!isAppReady) {
      alert('App is not ready. Please wait.');
      return;
    }

    const transactionData = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      timestamp: serverTimestamp()
    };

    try {
      if (editingTransaction) {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, editingTransaction.id);
        await updateDoc(docRef, transactionData);
        setEditingTransaction(null);
      } else {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/transactions`), transactionData);
      }
      // Reset form fields
      setFormData({
        date: '',
        description: '',
        amount: '',
        truckNumber: '',
        type: 'income',
        timestamp: null
      });
    } catch (e) {
      console.error("Error adding/updating document: ", e);
    }
  };

  // Set the form data for an existing transaction to be edited
  const startEditing = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      date: transaction.date || '',
      description: transaction.description || '',
      amount: transaction.amount || 0,
      truckNumber: transaction.truckNumber || '',
      type: transaction.type || 'income',
      timestamp: transaction.timestamp || null
    });
  };

  // Cancel the editing process
  const cancelEditing = () => {
    setEditingTransaction(null);
    setFormData({
      date: '',
      description: '',
      amount: '',
      truckNumber: '',
      type: 'income',
      timestamp: null
    });
  };

  // Open the delete confirmation modal
  const openDeleteModal = (transaction) => {
    setTransactionToDelete(transaction);
    setIsModalOpen(true);
  };

  // Close the delete confirmation modal
  const closeDeleteModal = () => {
    setIsModalOpen(false);
    setTransactionToDelete(null);
  };

  // Handle the deletion of a transaction
  const handleDeleteTransaction = async () => {
    if (!isAppReady || !transactionToDelete) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/transactions`, transactionToDelete.id));
      closeDeleteModal();
    } catch (e) {
      console.error("Error removing document: ", e);
    }
  };

  // Render the transaction table
  const renderTransactionTable = (data, title, showFilter) => {
    const totalIncome = data.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = data.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netProfit = totalIncome - totalExpense;

    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-8">
        <h3 className="text-2xl font-bold mb-4 flex items-center justify-between">
          <span>{title}</span>
          <span className={`text-lg font-semibold ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            Net Profit: ${netProfit.toFixed(2)}
          </span>
        </h3>
        {showFilter && (
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold">Filter View:</h4>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedView('all')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${selectedView === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              >
                All Records
              </button>
              <button
                onClick={() => setSelectedView('trucks')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${selectedView === 'trucks' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
              >
                By Truck
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead>
              <tr className="bg-gray-200 dark:bg-gray-700">
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400">Date</th>
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400">Truck #</th>
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400">Description</th>
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400 text-right">Amount</th>
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400">Type</th>
                <th className="px-4 py-2 text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((transaction, index) => (
                  <tr key={transaction.id} className={`${index % 2 === 0 ? 'bg-gray-100 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'} transition-colors hover:bg-gray-200 dark:hover:bg-gray-700`}>
                    <td className="border px-4 py-2">{transaction.date}</td>
                    <td className="border px-4 py-2">{transaction.truckNumber}</td>
                    <td className="border px-4 py-2">{transaction.description}</td>
                    <td className={`border px-4 py-2 text-right ${transaction.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>${transaction.amount.toFixed(2)}</td>
                    <td className="border px-4 py-2">{transaction.type}</td>
                    <td className="border px-4 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => startEditing(transaction)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          aria-label="Edit"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => openDeleteModal(transaction)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          aria-label="Delete"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500 dark:text-gray-400">No transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Main JSX structure
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white font-sans p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-extrabold flex items-center">
            <FaTruck className="mr-2 text-blue-600" /> Truck Finance Manager
          </h1>
          <div className="flex items-center space-x-2">
            <FaUser />
            <span className="text-sm">User ID: {userId ? userId : 'Authenticating...'}</span>
          </div>
        </header>

        {/* Transaction Form */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl mb-8">
          <h2 className="text-2xl font-semibold mb-4">{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="date">Date</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  required
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                  disabled={!isAppReady}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="truckNumber">Truck Number</label>
                <input
                  type="text"
                  id="truckNumber"
                  name="truckNumber"
                  value={formData.truckNumber}
                  onChange={handleInputChange}
                  required
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                  disabled={!isAppReady}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="amount">Amount ($)</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  required
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                  disabled={!isAppReady}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="type">Type</label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  required
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                  disabled={!isAppReady}
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                rows="2"
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white resize-none"
                disabled={!isAppReady}
              ></textarea>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="submit"
                className="flex items-center px-4 py-2 rounded-lg font-semibold transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!isAppReady}
              >
                {editingTransaction ? <><FaSave className="mr-2" /> Save Changes</> : <><FaPlus className="mr-2" /> Add Transaction</>}
              </button>
              {editingTransaction && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="flex items-center px-4 py-2 rounded-lg font-semibold transition-colors bg-gray-300 hover:bg-gray-400 text-gray-800"
                  disabled={!isAppReady}
                >
                  <FaTimes className="mr-2" /> Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Display Transactions */}
        {isAppReady && (
          <section>
            {selectedView === 'all' && renderTransactionTable(transactions, 'All Transactions', true)}
            {selectedView === 'trucks' && (
              <>
                <h3 className="text-2xl font-semibold mb-4">Select a Truck:</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.keys(groupedByTruck).length > 0 ? (
                    Object.keys(groupedByTruck).map(truckNumber => (
                      <button
                        key={truckNumber}
                        onClick={() => setSelectedTruck(truckNumber)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${selectedTruck === truckNumber ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                      >
                        Truck #{truckNumber}
                      </button>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400">No truck records found.</p>
                  )}
                </div>
              </>
            )}
            {selectedView === 'trucks' && selectedTruck && (
              <>
                <h3 className="text-xl font-semibold mb-4">Records for Truck: {selectedTruck}</h3>
                {renderTransactionTable(groupedByTruck[selectedTruck], 'all', false)}
              </>
            )}
          </section>
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