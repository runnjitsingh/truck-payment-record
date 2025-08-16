import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, addDoc, deleteDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Main App component
const App = () => {
  // State variables for transactions, form inputs, and Firebase status
  const [transactions, setTransactions] = useState([]);
  const [formState, setFormState] = useState({ date: '', description: '', amount: '' });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [appId, setAppId] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [error, setError] = useState('');

  // useEffect to initialize Firebase and handle authentication
  useEffect(() => {
    const initFirebase = async () => {
      try {
        // IMPORTANT: Replace the empty object with your actual Firebase configuration
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
          apiKey: "AIzaSyA4id5rldiv9oLlPRYHp89CJvyrNJ3NPV4",
          authDomain: "truck-payment-record.firebaseapp.com",
          projectId: "truck-payment-record",
          storageBucket: "truck-payment-record.firebasestorage.app",
          messagingSenderId: "646930084187",
          appId: "1:646930084187:web:bc4df27c97ea6e470f6a7e"
        };

        if (Object.keys(firebaseConfig).length === 0) {
          setError("Firebase configuration is missing. Please add your config from the Firebase Console.");
          setLoading(false);
          return;
        }

        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        setAppId(currentAppId);

        // Listen for authentication state changes
        const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
          } else {
            // Sign in anonymously if no user is found
            await signInAnonymously(firebaseAuth);
          }
        });

        // Use the initial auth token if available to sign in
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (initialAuthToken) {
          await signInWithCustomToken(firebaseAuth, initialAuthToken);
        }

        // Cleanup function
        return () => unsubscribeAuth();
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        setError("Failed to initialize Firebase. Check your configuration.");
        setLoading(false);
      }
    };
    initFirebase();
  }, []);

  // useEffect to set up the Firestore real-time listener
  useEffect(() => {
    if (!isAuthReady || !db || !userId) {
      // Don't proceed until auth is ready and we have a userId
      return;
    }

    setLoading(true);

    // Get the reference to the user's private transactions collection
    const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);

    // Set up the real-time listener with onSnapshot
    const unsubscribe = onSnapshot(transactionsCollectionRef, (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Ensure date is a Date object or string for sorting
        date: doc.data().date instanceof Date ? doc.data().date.toISOString().split('T')[0] : doc.data().date?.toDate()?.toISOString().split('T')[0] || ''
      }));

      // Sort transactions by date in descending order (newest first)
      newTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(newTransactions);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching transactions:", error);
      setError("Failed to fetch transactions from the database.");
      setLoading(false);
    });

    // Cleanup the listener when the component unmounts
    return () => unsubscribe();
  }, [isAuthReady, db, userId, appId]);

  // Handle changes to form inputs
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission to add or update a transaction
  const handleAddOrUpdateTransaction = async (type, e) => {
      e.preventDefault();

      if (!db || !userId) {
          setError("Database connection not ready. Please wait.");
          return;
      }

    const currentFormState = editingTransaction ? formState : { ...formState, amount: parseFloat(formState.amount) };

    // Input validation
    if (!currentFormState.date || !currentFormState.description || !currentFormState.amount) {
        setError("Please fill in all fields.");
        return;
    }

    const transactionData = {
      date: new Date(currentFormState.date),
      description: currentFormState.description,
      amount: parseFloat(currentFormState.amount),
      type,
      createdAt: serverTimestamp(),
    };

    try {
      if (editingTransaction) {
        // Update an existing transaction
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, editingTransaction.id);
        await updateDoc(docRef, transactionData);
        setEditingTransaction(null); // Exit edit mode
      } else {
        // Add a new transaction
        const docRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
        await addDoc(docRef, transactionData);
      }

      // Reset form fields and clear any previous errors
      setFormState({ date: '', description: '', amount: '' });
      setError('');
    } catch (error) {
      console.error("Error adding/updating document:", error);
      setError("Failed to save transaction. Check your database rules.");
    }
  };

  // Set the form fields for editing
  const startEditing = (transaction) => {
    setEditingTransaction(transaction);
    setFormState({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
    });
  };

  // Open the delete confirmation modal
  const openDeleteModal = (transaction) => {
    setTransactionToDelete(transaction);
    setIsModalOpen(true);
  };

  // Close the delete confirmation modal
  const closeDeleteModal = () => {
    setTransactionToDelete(null);
    setIsModalOpen(false);
  };

  // Handle the deletion of a transaction
  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, transactionToDelete.id);
      await deleteDoc(docRef);
      closeDeleteModal(); // Close the modal after deletion
    } catch (error) {
      console.error("Error deleting document:", error);
      setError("Failed to delete transaction.");
    }
  };

  // Calculate the summary totals
  const totalPaymentsGiven = transactions
    .filter(t => t.type === 'payment_given')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalPaymentsReceived = transactions
    .filter(t => t.type === 'payment_received')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalCommissions = transactions
    .filter(t => t.type === 'commission')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const netBalance = totalPaymentsReceived - (totalPaymentsGiven + totalCommissions);

  // Get styles based on transaction type
  const getTransactionStyle = (type) => {
    switch (type) {
      case 'payment_received':
        return {
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderColor: '#bbf7d0',
        };
      case 'payment_given':
        return {
          backgroundColor: '#e0e7ff',
          color: '#3730a3',
          borderColor: '#c7d2fe',
        };
      case 'commission':
        return {
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderColor: '#fde68a',
        };
      default:
        return {};
    }
  };

  // Render a transaction list for a given type
  const renderTransactionList = (type) => {
    const filteredTransactions = transactions.filter(t => t.type === type);
    const title = type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

    return (
      <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4 text-center">{title}</h2>
        {filteredTransactions.length > 0 ? (
          <div className="space-y-4">
            {filteredTransactions.map(t => (
              <div
                key={t.id}
                className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-lg shadow-md"
                style={getTransactionStyle(t.type)}
              >
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full">
                  <span className="text-sm font-medium w-32 shrink-0">
                    {t.date}
                  </span>
                  <span className="flex-1 font-semibold">{t.description}</span>
                  <span className="font-bold shrink-0">
                    ${t.amount ? t.amount.toFixed(2) : '0.00'}
                  </span>
                </div>
                <div className="flex space-x-2 mt-2 sm:mt-0">
                  <button
                    onClick={() => startEditing(t)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openDeleteModal(t)}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400">No transactions of this type yet.</p>
        )}
      </div>
    );
  };

  // Render the UI
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 font-inter">
      <div className="container mx-auto max-w-4xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">

        {/* Header */}
        <h1 className="text-3xl font-bold text-center mb-6 text-blue-600 dark:text-blue-400">
          Transaction Manager
        </h1>

        {/* User ID display for reference */}
        <div className="mb-4 text-xs text-center text-gray-500 dark:text-gray-400 truncate">
          <p>User ID: {userId || 'Authenticating...'}</p>
        </div>

        {/* Error message display */}
        {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-4 text-center">
                <p>{error}</p>
            </div>
        )}

        {/* Summary section */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-center">
          <div className="bg-green-100 dark:bg-green-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-green-700 dark:text-green-300">Received</h2>
            <p className="text-2xl font-bold mt-2">${totalPaymentsReceived.toFixed(2)}</p>
          </div>
          <div className="bg-indigo-100 dark:bg-indigo-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">Given</h2>
            <p className="text-2xl font-bold mt-2">${totalPaymentsGiven.toFixed(2)}</p>
          </div>
          <div className="bg-yellow-100 dark:bg-yellow-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-yellow-700 dark:text-yellow-300">Commissions</h2>
            <p className="text-2xl font-bold mt-2">${totalCommissions.toFixed(2)}</p>
          </div>
          <div className="bg-blue-100 dark:bg-blue-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-300">Net Balance</h2>
            <p className="text-2xl font-bold mt-2">${netBalance.toFixed(2)}</p>
          </div>
        </div>

        {/* Add/Edit Transaction Sections */}
        <div className="space-y-6">
          {editingTransaction ? (
            <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-4 text-center">Edit Transaction</h2>
              <form onSubmit={(e) => handleAddOrUpdateTransaction(editingTransaction.type, e)} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                  <input
                    type="date"
                    name="date"
                    value={formState.date}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={formState.description}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    placeholder="Amount"
                    value={formState.amount}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                >
                  Update Transaction
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors mt-2"
                >
                  Cancel Edit
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Payment Given Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-semibold mb-4 text-center text-indigo-500 dark:text-indigo-400">Payment Given</h2>
                <form onSubmit={(e) => handleAddOrUpdateTransaction('payment_given', e)} className="space-y-4">
                  <input
                    type="date"
                    name="date"
                    value={formState.date}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={formState.description}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    placeholder="Amount"
                    value={formState.amount}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                  >
                    Add Payment Given
                  </button>
                </form>
              </div>

              {/* Payment Received Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-semibold mb-4 text-center text-green-500 dark:text-green-400">Payment Received</h2>
                <form onSubmit={(e) => handleAddOrUpdateTransaction('payment_received', e)} className="space-y-4">
                  <input
                    type="date"
                    name="date"
                    value={formState.date}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={formState.description}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    placeholder="Amount"
                    value={formState.amount}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                  >
                    Add Payment Received
                  </button>
                </form>
              </div>

              {/* Commission Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-semibold mb-4 text-center text-yellow-500 dark:text-yellow-400">Commission</h2>
                <form onSubmit={(e) => handleAddOrUpdateTransaction('commission', e)} className="space-y-4">
                  <input
                    type="date"
                    name="date"
                    value={formState.date}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    name="description"
                    placeholder="Description"
                    value={formState.description}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    placeholder="Amount"
                    value={formState.amount}
                    onChange={handleFormChange}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
                  />
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                  >
                    Add Commission
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Transaction lists */}
        <div className="mt-6 space-y-6">
          {renderTransactionList('payment_received')}
          {renderTransactionList('payment_given')}
          {renderTransactionList('commission')}
        </div>

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
                >
                  Yes, Delete
                </button>
                <button
                  onClick={closeDeleteModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors"
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
