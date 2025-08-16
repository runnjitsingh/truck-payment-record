import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, addDoc, deleteDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

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
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState('dashboard'); // State for navigation

  // New states for the detail pages and search queries
  const [selectedChallan, setSelectedChallan] = useState(null);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [challanSearchQuery, setChallanSearchQuery] = useState('');
  const [truckSearchQuery, setTruckSearchQuery] = useState('');

  // Separate state variables for each form to prevent automatic population
  const [paymentGivenFormState, setPaymentGivenFormState] = useState({ date: '', amount: '', dueDate: '', challanNo: '', fromAccount: '', toAccount: '', notes: '', truckNo: '' });
  const [paymentReceivedFormState, setPaymentReceivedFormState] = useState({ date: '', amount: '', challanNo: '', notes: '', truckNo: '' });
  const [commissionFormState, setCommissionFormState] = useState({ date: '', amount: '', challanNo: '', notes: '', truckNo: '' });

  // State for the single editing form
  const [editFormState, setEditFormState] = useState(null);

  // useEffect to initialize Firebase and handle authentication
  useEffect(() => {
    const initFirebase = async () => {
      try {
        // Firebase configuration will be provided at runtime by the Canvas environment
        const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        
        if (!firebaseConfig) {
          throw new Error('Firebase configuration is missing from the environment.');
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
        setIsAppReady(true); // Allow UI interaction even if init fails
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

    // Get the reference to the user's private transactions collection
    const transactionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);

    // Set up the real-time listener with onSnapshot
    const unsubscribe = onSnapshot(transactionsCollectionRef, (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Ensure date is a Date object or string for sorting
        date: doc.data().date?.toDate ? doc.data().date.toDate().toISOString().split('T')[0] : doc.data().date || ''
      }));

      // Sort transactions by date in descending order (newest first)
      newTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(newTransactions);
      // ADDED: Set isAppReady to true once data is loaded for the first time
      setIsAppReady(true);
    }, (error) => {
      console.error("Error fetching transactions:", error);
      setError("Failed to fetch transactions from the database.");
      // ADDED: Set isAppReady to true even on error so buttons are not stuck
      setIsAppReady(true);
    });

    // Cleanup the listener when the component unmounts
    return () => unsubscribe();
  }, [isAuthReady, db, userId, appId]);

  // Handle changes for Payment Given form
  const handlePaymentGivenChange = (e) => {
    const { name, value } = e.target;
    let newDueDate = paymentGivenFormState.dueDate;
    if (name === 'date') {
      const date = new Date(value);
      date.setDate(date.getDate() + 7);
      newDueDate = date.toISOString().split('T')[0];
    }
    setPaymentGivenFormState(prev => ({ ...prev, [name]: value, dueDate: newDueDate }));
  };

  // Handle changes for Payment Received form
  const handlePaymentReceivedChange = (e) => {
    const { name, value } = e.target;
    setPaymentReceivedFormState(prev => ({ ...prev, [name]: value }));
  };

  // Handle changes for Commission form
  const handleCommissionChange = (e) => {
    const { name, value } = e.target;
    setCommissionFormState(prev => ({ ...prev, [name]: value }));
  };

  // Handle changes for the single edit form
  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormState(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission to add or update a transaction
  const handleAddOrUpdateTransaction = async (type) => {
      // CHANGED: Use the new isAppReady state
      if (!isAppReady) {
          setError("App is not ready. Please wait.");
          return;
      }

    let formData;
    if (editingTransaction) {
      formData = editFormState;
    } else {
      switch(type) {
        case 'payment_given':
          formData = paymentGivenFormState;
          break;
        case 'payment_received':
          formData = paymentReceivedFormState;
          break;
        case 'commission_details':
          formData = commissionFormState;
          break;
        default:
          setError("Invalid transaction type.");
          return;
      }
    }

    // Input validation
    if (!formData.date || !formData.amount) {
        setError("Please fill in all mandatory fields: Date and Amount.");
        return;
    }

    const transactionData = {
      ...formData,
      date: new Date(formData.date),
      amount: parseInt(formData.amount),
      type,
      createdAt: serverTimestamp(),
    };

    try {
      if (editingTransaction) {
        // Update an existing transaction
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, editingTransaction.id);
        await updateDoc(docRef, transactionData);
        setEditingTransaction(null); // Exit edit mode
        setEditFormState(null); // Clear the edit form state
      } else {
        // Add a new transaction
        const docRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
        await addDoc(docRef, transactionData);
      }

      // Reset form fields based on type for dashboard forms
      if (type === 'payment_given') setPaymentGivenFormState({ date: '', amount: '', dueDate: '', challanNo: '', fromAccount: '', toAccount: '', notes: '', truckNo: '' });
      if (type === 'payment_received') setPaymentReceivedFormState({ date: '', amount: '', challanNo: '', notes: '', truckNo: '' });
      if (type === 'commission_details') setCommissionFormState({ date: '', amount: '', challanNo: '', notes: '', truckNo: '' });

      setError(''); // Clear any previous errors
    } catch (error) {
      console.error("Error adding/updating document:", error);
      setError("Failed to save transaction. Check your database rules.");
    }
  };

  // Set the form fields for editing
  const startEditing = (transaction) => {
    setEditingTransaction(transaction);
    const formStateToSet = {
      date: transaction.date,
      amount: transaction.amount,
      dueDate: transaction.dueDate || '',
      challanNo: transaction.challanNo || '',
      fromAccount: transaction.fromAccount || '',
      toAccount: transaction.toAccount || '',
      notes: transaction.notes || '',
      truckNo: transaction.truckNo || '',
    };
    setEditFormState(formStateToSet);
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
    .filter(t => t.type === 'commission_details')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Render a transaction list in a table format
  const renderTransactionTable = (list, type, showActions = true) => {
    const filteredList = list.filter(t => t.type === type);
    if (filteredList.length === 0) {
      return <p className="text-center text-gray-500 dark:text-gray-400">No records of this type found.</p>;
    }

    let headers = [];
    let rowData = (t) => [];

    switch(type) {
      case 'payment_given':
        headers = ['Date', 'Truck No.', 'Challan No.', 'From Account', 'To Account', 'Amount (₹)', 'Due Date', 'Notes'];
        rowData = (t) => [t.date, t.truckNo || 'N/A', t.challanNo || 'N/A', t.fromAccount || 'N/A', t.toAccount || 'N/A', t.amount ? t.amount.toFixed(0) : '0', t.dueDate || 'N/A', t.notes || 'N/A'];
        break;
      case 'payment_received':
        headers = ['Date', 'Truck No.', 'Challan No.', 'Amount (₹)', 'Notes'];
        rowData = (t) => [t.date, t.truckNo || 'N/A', t.challanNo || 'N/A', t.amount ? t.amount.toFixed(0) : '0', t.notes || 'N/A'];
        break;
      case 'commission_details':
        headers = ['Date', 'Truck No.', 'Challan No.', 'Amount (₹)', 'Notes'];
        rowData = (t) => [t.date, t.truckNo || 'N/A', t.challanNo || 'N/A', t.amount ? t.amount.toFixed(0) : '0', t.notes || 'N/A'];
        break;
      default:
        headers = ['Date', 'Truck No.', 'Challan No.', 'Amount (₹)', 'Notes'];
        rowData = (t) => [t.date, t.truckNo || 'N/A', t.challanNo || 'N/A', t.amount ? t.amount.toFixed(0) : '0', t.notes || 'N/A'];
    }

    if (showActions) {
      headers.push('Actions');
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <thead className="bg-gray-200 dark:bg-gray-700">
            <tr>
              {headers.map(header => (
                <th key={header} className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-200 dark:divide-gray-700">
            {filteredList.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                {rowData(t).map((data, index) => (
                    <td key={index} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{data}</td>
                ))}
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => startEditing(t)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm mr-2"
                      disabled={!isAppReady}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDeleteModal(t)}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm"
                      disabled={!isAppReady}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Group transactions by Challan Number
  const groupedByChallan = transactions.filter(t => t.challanNo).reduce((acc, t) => {
    const challan = t.challanNo;
    if (!acc[challan]) {
      acc[challan] = [];
    }
    acc[challan].push(t);
    return acc;
  }, {});

  // Group transactions by Truck Number
  const groupedByTruck = transactions.filter(t => t.truckNo).reduce((acc, t) => {
    const truck = t.truckNo;
    if (!acc[truck]) {
      acc[truck] = [];
    }
    acc[truck].push(t);
    return acc;
  }, {});

  // Filtered lists for the buttons based on search queries
  const filteredChallanKeys = Object.keys(groupedByChallan).filter(challan =>
    challan.toLowerCase().includes(challanSearchQuery.toLowerCase())
  ).sort(); // Sort alphabetically for consistent ordering

  const filteredTruckKeys = Object.keys(groupedByTruck).filter(truck =>
    truck.toLowerCase().includes(truckSearchQuery.toLowerCase())
  ).sort(); // Sort alphabetically for consistent ordering


  // Render the UI
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 font-inter">
      {/* Apply custom styles to hide number input arrows */}
      <style>{customStyles}</style>
      <div className="container mx-auto max-w-4xl p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">

        {/* Header */}
        <h1 className="text-3xl font-bold text-center mb-6 text-blue-600 dark:text-blue-400">
          Truck Payment - Advance and Commission
        </h1>

        {/* Navigation */}
        <div className="flex justify-center space-x-4 mb-6 flex-wrap">
          <button
            onClick={() => { setCurrentPage('dashboard'); setEditingTransaction(null); }}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => { setCurrentPage('allRecords'); setEditingTransaction(null); }}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${currentPage === 'allRecords' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'}`}
          >
            All Records
          </button>
          <button
            onClick={() => { setCurrentPage('challanRecords'); setSelectedChallan(null); }}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${currentPage === 'challanRecords' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'}`}
          >
            Challan Records
          </button>
          <button
            onClick={() => { setCurrentPage('truckRecords'); setSelectedTruck(null); }}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${currentPage === 'truckRecords' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600'}`}
          >
            Truck Records
          </button>
        </div>

        {/* User ID display for reference */}
        <div className="mb-4 text-xs text-center text-gray-500 dark:text-gray-400 truncate">
          <p>User ID: {userId || 'Authenticating...'}</p>
        </div>

        {/* Loading message */}
        { !isAppReady && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-md mb-4 text-center">
            <p>Loading records. Please wait...</p>
          </div>
        )}

        {/* Error message display */}
        {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-4 text-center">
                <p>{error}</p>
            </div>
        )}

        {/* Conditional rendering based on currentPage */}
        {currentPage === 'dashboard' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Add Payment Given Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md md:col-span-3">
                <h2 className="text-2xl font-semibold mb-4 text-center text-indigo-500 dark:text-indigo-400">Payment Given</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleAddOrUpdateTransaction('payment_given'); }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="date" name="date" value={paymentGivenFormState.date} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" placeholder="Date" disabled={!isAppReady} />
                    <input type="date" name="dueDate" value={paymentGivenFormState.dueDate} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" placeholder="Due Date" disabled={!isAppReady} />
                    <input type="text" name="truckNo" placeholder="Truck No." value={paymentGivenFormState.truckNo} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="text" name="challanNo" placeholder="Challan No." value={paymentGivenFormState.challanNo} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <select name="fromAccount" value={paymentGivenFormState.fromAccount} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} >
                      <option value="">Select From Account</option>
                      <option value="PNB">PNB</option>
                      <option value="KB">KB</option>
                      <option value="CASH">CASH</option>
                    </select>
                    <input type="text" name="toAccount" placeholder="To Account" value={paymentGivenFormState.toAccount} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="number" step="1" name="amount" placeholder="Amount" value={paymentGivenFormState.amount} onChange={handlePaymentGivenChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <textarea name="notes" placeholder="Notes" value={paymentGivenFormState.notes} onChange={handlePaymentGivenChange} rows="3" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 md:col-span-2" disabled={!isAppReady} />
                  </div>
                  <button type="submit" className={`w-full font-bold py-2 px-4 rounded-lg shadow-md transition-colors ${!isAppReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} disabled={!isAppReady} > Add Payment Given </button>
                </form>
              </div>
              {/* Add Payment Received Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md md:col-span-3">
                <h2 className="text-2xl font-semibold mb-4 text-center text-green-500 dark:text-green-400">Payment Received</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleAddOrUpdateTransaction('payment_received'); }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="date" name="date" value={paymentReceivedFormState.date} onChange={handlePaymentReceivedChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" placeholder="Date" disabled={!isAppReady} />
                    <input type="text" name="truckNo" placeholder="Truck No." value={paymentReceivedFormState.truckNo} onChange={handlePaymentReceivedChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="text" name="challanNo" placeholder="Challan No." value={paymentReceivedFormState.challanNo} onChange={handlePaymentReceivedChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="number" step="1" name="amount" placeholder="Amount" value={paymentReceivedFormState.amount} onChange={handlePaymentReceivedChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <textarea name="notes" placeholder="Notes" value={paymentReceivedFormState.notes} onChange={handlePaymentReceivedChange} rows="3" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 md:col-span-2" disabled={!isAppReady} />
                  </div>
                  <button type="submit" className={`w-full font-bold py-2 px-4 rounded-lg shadow-md transition-colors ${!isAppReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} disabled={!isAppReady} > Add Payment Received </button>
                </form>
              </div>
              {/* Add Commission Form */}
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md md:col-span-3">
                <h2 className="text-2xl font-semibold mb-4 text-center text-yellow-500 dark:text-yellow-400">Commission Details</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleAddOrUpdateTransaction('commission_details'); }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="date" name="date" value={commissionFormState.date} onChange={handleCommissionChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" placeholder="Date" disabled={!isAppReady} />
                    <input type="text" name="truckNo" placeholder="Truck No." value={commissionFormState.truckNo} onChange={handleCommissionChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="text" name="challanNo" placeholder="Challan No." value={commissionFormState.challanNo} onChange={handleCommissionChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <input type="number" step="1" name="amount" placeholder="Amount" value={commissionFormState.amount} onChange={handleCommissionChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800" disabled={!isAppReady} />
                    <textarea name="notes" placeholder="Notes" value={commissionFormState.notes} onChange={handleCommissionChange} rows="3" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 md:col-span-2" disabled={!isAppReady} />
                  </div>
                  <button type="submit" className={`w-full font-bold py-2 px-4 rounded-lg shadow-md transition-colors ${!isAppReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} disabled={!isAppReady} > Add Commission </button>
                </form>
              </div>
            </div>
            {/* Summary */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Total Payments Given</h3>
                <p className="text-3xl font-bold mt-2">₹ {totalPaymentsGiven.toFixed(0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-green-600 dark:text-green-400">Total Payments Received</h3>
                <p className="text-3xl font-bold mt-2">₹ {totalPaymentsReceived.toFixed(0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-yellow-600 dark:text-yellow-400">Total Commissions</h3>
                <p className="text-3xl font-bold mt-2">₹ {totalCommissions.toFixed(0)}</p>
              </div>
            </div>
          </>
        )}

        {currentPage === 'allRecords' && (
          <>
            <h2 className="text-2xl font-semibold mb-4 text-center">All Records</h2>
            {editingTransaction ? (
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow-md mb-6">
                <h3 className="text-xl font-semibold mb-4 text-center text-blue-600 dark:text-blue-400">Edit Record</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleAddOrUpdateTransaction(editingTransaction.type); }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="date" name="date" value={editFormState?.date || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                    <input type="text" name="truckNo" placeholder="Truck No." value={editFormState?.truckNo || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                    <input type="text" name="challanNo" placeholder="Challan No." value={editFormState?.challanNo || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                    <input type="number" step="1" name="amount" placeholder="Amount" value={editFormState?.amount || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                    {editingTransaction.type === 'payment_given' && (
                      <>
                        <input type="date" name="dueDate" placeholder="Due Date" value={editFormState?.dueDate || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                        <select name="fromAccount" value={editFormState?.fromAccount || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady}>
                          <option value="">Select From Account</option>
                          <option value="PNB">PNB</option>
                          <option value="KB">KB</option>
                          <option value="CASH">CASH</option>
                        </select>
                        <input type="text" name="toAccount" placeholder="To Account" value={editFormState?.toAccount || ''} onChange={handleEditFormChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg" disabled={!isAppReady} />
                      </>
                    )}
                    <textarea name="notes" placeholder="Notes" value={editFormState?.notes || ''} onChange={handleEditFormChange} rows="3" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg md:col-span-2" disabled={!isAppReady} />
                  </div>
                  <div className="flex justify-end space-x-4 mt-4">
                    <button
                      type="button"
                      onClick={() => { setEditingTransaction(null); setEditFormState(null); }}
                      className={`font-bold py-2 px-4 rounded-lg shadow-md transition-colors ${!isAppReady ? 'bg-gray-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                      disabled={!isAppReady}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={`font-bold py-2 px-4 rounded-lg shadow-md transition-colors ${!isAppReady ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                      disabled={!isAppReady}
                    >
                      Update Record
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                  <thead className="bg-gray-200 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Truck No.</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Challan No.</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Amount (₹)</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Notes</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {transactions.length > 0 ? (
                      transactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.date}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.type.replace('_', ' ')}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.truckNo || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.challanNo || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.amount ? t.amount.toFixed(0) : '0'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{t.notes || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => startEditing(t)}
                              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm mr-2"
                              disabled={!isAppReady}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => openDeleteModal(t)}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors shadow-sm"
                              disabled={!isAppReady}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="text-center py-4 text-gray-500 dark:text-gray-400">No records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {currentPage === 'challanRecords' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4 text-center">Challan Records</h2>
            <div className="flex justify-center mb-4">
              <input
                type="text"
                placeholder="Search by Challan Number..."
                value={challanSearchQuery}
                onChange={(e) => setChallanSearchQuery(e.target.value)}
                className="w-full max-w-sm p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
              />
            </div>
            {!selectedChallan ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredChallanKeys.length > 0 ? (
                  filteredChallanKeys.map(challan => (
                    <button
                      key={challan}
                      onClick={() => setSelectedChallan(challan)}
                      className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      disabled={!isAppReady}
                    >
                      <h3 className="font-bold text-lg">{challan}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{groupedByChallan[challan].length} records</p>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400">No challan records found.</p>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSelectedChallan(null)}
                  className="mb-4 px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  ← Back to Challans
                </button>
                <h3 className="text-xl font-semibold mb-4">Records for Challan: {selectedChallan}</h3>
                {renderTransactionTable(groupedByChallan[selectedChallan], 'all', false)}
              </>
            )}
          </div>
        )}

        {currentPage === 'truckRecords' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4 text-center">Truck Records</h2>
            <div className="flex justify-center mb-4">
              <input
                type="text"
                placeholder="Search by Truck Number..."
                value={truckSearchQuery}
                onChange={(e) => setTruckSearchQuery(e.target.value)}
                className="w-full max-w-sm p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
              />
            </div>
            {!selectedTruck ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredTruckKeys.length > 0 ? (
                  filteredTruckKeys.map(truck => (
                    <button
                      key={truck}
                      onClick={() => setSelectedTruck(truck)}
                      className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      disabled={!isAppReady}
                    >
                      <h3 className="font-bold text-lg">{truck}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{groupedByTruck[truck].length} records</p>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400">No truck records found.</p>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSelectedTruck(null)}
                  className="mb-4 px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  ← Back to Trucks
                </button>
                <h3 className="text-xl font-semibold mb-4">Records for Truck: {selectedTruck}</h3>
                {renderTransactionTable(groupedByTruck[selectedTruck], 'all', false)}
              </>
            )}
          </div>
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
