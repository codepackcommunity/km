'use client'
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, writeBatch
} from 'firebase/firestore';

const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Data states
  const [stocks, setStocks] = useState([]);
  const [sales, setSales] = useState([]);
  const [currentLocation, setCurrentLocation] = useState('');
  
  // Analytics states
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {}
  });

  // Quick sale state
  const [quickSale, setQuickSale] = useState({
    itemCode: '',
    quantity: 1,
    customPrice: ''
  });

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');

  // Refs to track user state for listeners
  const userRef = useRef(null);
  const locationRef = useRef('');

  // Wrap initializeDashboard in useCallback with proper dependencies
  const initializeDashboard = useCallback(async (userData) => {
    try {
      console.log('Initializing dashboard for location:', userData.location);
      await Promise.all([
        fetchStocks(userData.location),
        fetchSalesAnalysis(userData.location, userData.uid)
      ]);
      setupRealtimeListeners(userData.location, userData.uid);
    } catch (error) {
      console.error('Error initializing dashboard:', error);
    }
  }, []);

  // Wrap handleUserAuth in useCallback with proper dependencies
  const handleUserAuth = useCallback(async (firebaseUser) => {
    try {
      console.log('Authenticating user:', firebaseUser.uid);
      
      const userDoc = await getDocs(
        query(collection(db, 'users'), where('uid', '==', firebaseUser.uid))
      );
      
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        console.log('User data found:', userData);
        
        if (userData.role === 'sales' || userData.role === 'dataEntry') {
          setUser(userData);
          userRef.current = userData;
          const userLocation = userData.location || 'Lilongwe';
          setCurrentLocation(userLocation);
          locationRef.current = userLocation;
          console.log('User location set to:', userLocation);
          await initializeDashboard(userData);
        } else {
          console.log('User role not allowed:', userData.role);
          router.push('/dashboard');
        }
      } else {
        console.log('No user document found');
        router.push('/login');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      router.push('/login');
    }
  }, [router, initializeDashboard]); // Added initializeDashboard as dependency

  // Wrap setupRealtimeListeners in useCallback
  const setupRealtimeListeners = useCallback((location, userId) => {
    console.log('Setting up realtime listeners for location:', location, 'user:', userId);
    
    if (!location || !userId) {
      console.error('Invalid parameters for listeners:', { location, userId });
      return () => {}; // Return empty cleanup function
    }

    // Real-time stock updates for user's location only
    const stocksQuery = query(
      collection(db, 'stocks'),
      where('location', '==', location)
    );
    
    const unsubscribeStocks = onSnapshot(stocksQuery, 
      (snapshot) => {
        const stocksData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('Stocks updated:', stocksData.length, 'items');
        setStocks(stocksData);
      }, 
      (error) => {
        console.error('Error in stocks listener:', error);
      }
    );

    // Real-time sales updates for user's location and user only
    const salesQuery = query(
      collection(db, 'sales'),
      where('location', '==', location),
      where('soldBy', '==', userId),
      orderBy('soldAt', 'desc')
    );

    const unsubscribeSales = onSnapshot(salesQuery, 
      (snapshot) => {
        const salesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('Sales updated:', salesData.length, 'sales');
        setSales(salesData);
        calculateSalesAnalysis(salesData);
      }, 
      (error) => {
        console.error('Error in sales listener:', error);
      }
    );

    return () => {
      unsubscribeStocks();
      unsubscribeSales();
    };
  }, []); // Added dependencies: setStocks, setSales

  // Wrap fetchSalesAnalysis in useCallback
  const fetchSalesAnalysis = useCallback(async (location, userId) => {
    try {
      console.log('Fetching sales for location:', location, 'user:', userId);
      
      if (!location || !userId) {
        console.error('Invalid parameters for sales fetch:', { location, userId });
        return;
      }

      const q = query(
        collection(db, 'sales'),
        where('location', '==', location),
        where('soldBy', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Fetched sales:', salesData.length);
      setSales(salesData);
      calculateSalesAnalysis(salesData);
    } catch (error) {
      console.error('Error fetching sales:', error);
      alert('Error loading sales data. Please refresh the page.');
    }
  }, [setSales]); // Added setSales as dependency

  // Wrap calculateSalesAnalysis in useCallback
  const calculateSalesAnalysis = useCallback((salesData) => {
    const analysis = {
      totalSales: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      topProducts: {}
    };

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    salesData.forEach(sale => {
      analysis.totalRevenue += sale.finalSalePrice || 0;
      analysis.totalSales++;

      const saleDate = sale.soldAt?.toDate();
      if (saleDate && saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
        analysis.monthlyRevenue += sale.finalSalePrice || 0;
      }

      const productKey = `${sale.brand}-${sale.model}`;
      analysis.topProducts[productKey] = (analysis.topProducts[productKey] || 0) + 1;
    });

    setSalesAnalysis(analysis);
  }, [setSalesAnalysis]); // Added setSalesAnalysis as dependency

  // Wrap fetchStocks in useCallback
  const fetchStocks = useCallback(async (location) => {
    try {
      console.log('Fetching stocks for location:', location);
      
      if (!location) {
        console.error('No location provided for stocks fetch');
        return;
      }

      const q = query(
        collection(db, 'stocks'),
        where('location', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log('Fetched stocks:', stocksData.length);
      setStocks(stocksData);
    } catch (error) {
      console.error('Error fetching stocks:', error);
      alert('Error loading stock data. Please refresh the page.');
    }
  }, [setStocks]); // Added setStocks as dependency

  // Authentication and initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await handleUserAuth(firebaseUser);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, handleUserAuth]);

  // Enhanced Sales functions with better error handling
  const handleQuickSale = async () => {
    if (!quickSale.itemCode) {
      alert('Please enter an item code.');
      return;
    }

    try {
      console.log('Starting quick sale process...');
      
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', quickSale.itemCode),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        alert('Item not found in stock for your location!');
        return;
      }

      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();
      console.log('Found stock item:', stock);

      // Validate stock data
      if (!stock.quantity && stock.quantity !== 0) {
        alert('Invalid stock data. Please contact administrator.');
        return;
      }

      if (stock.quantity < quickSale.quantity) {
        alert(`Insufficient stock! Only ${stock.quantity} units available.`);
        return;
      }

      // Calculate final price
      let finalPrice;
      if (quickSale.customPrice) {
        finalPrice = parseFloat(quickSale.customPrice);
        if (isNaN(finalPrice) || finalPrice <= 0) {
          alert('Please enter a valid custom price.');
          return;
        }
      } else {
        const salePrice = parseFloat(stock.salePrice) || 0;
        const discountPercentage = parseFloat(stock.discountPercentage) || 0;
        finalPrice = salePrice * (1 - discountPercentage / 100) * quickSale.quantity;
      }

      console.log('Final price calculated:', finalPrice);

      // Use batch write for atomic operation
      const batch = writeBatch(db);

      // Update stock quantity
      const newQuantity = stock.quantity - quickSale.quantity;
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp()
      });

      // Create sale record
      const saleData = {
        itemCode: stock.itemCode,
        brand: stock.brand,
        model: stock.model,
        storage: stock.storage,
        color: stock.color,
        stockId: stockDoc.id,
        quantity: quickSale.quantity,
        originalPrice: parseFloat(stock.salePrice) || 0,
        finalSalePrice: finalPrice,
        customPrice: quickSale.customPrice ? parseFloat(quickSale.customPrice) : null,
        discountPercentage: parseFloat(stock.discountPercentage) || 0,
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: currentLocation,
        saleType: quickSale.customPrice ? 'custom_price' : 'standard',
        status: 'completed'
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      // Commit the batch
      await batch.commit();
      console.log('Sale completed successfully');

      // Reset form
      setQuickSale({ itemCode: '', quantity: 1, customPrice: '' });
      alert('Sale completed successfully!');
      
    } catch (error) {
      console.error('Error processing sale:', error);
      let errorMessage = 'Error processing sale. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check if you have sales permissions.';
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Stock was modified by another user. Please try again.';
      }
      
      alert(errorMessage);
    }
  };

  const handleSellItem = async (stockId, stockData, quantity = 1) => {
    try {
      console.log('Selling item:', stockId, quantity);
      
      // Validate input
      if (!stockData.quantity && stockData.quantity !== 0) {
        alert('Invalid stock data. Please contact administrator.');
        return;
      }

      if (stockData.quantity < quantity) {
        alert(`Insufficient stock! Only ${stockData.quantity} units available.`);
        return;
      }

      if (quantity <= 0) {
        alert('Please enter a valid quantity.');
        return;
      }

      // Calculate final price
      const salePrice = parseFloat(stockData.salePrice) || 0;
      const discountPercentage = parseFloat(stockData.discountPercentage) || 0;
      const finalPrice = salePrice * (1 - discountPercentage / 100) * quantity;

      console.log('Calculated final price:', finalPrice);

      // Use batch write for atomic operation
      const batch = writeBatch(db);

      // Update stock quantity
      const newQuantity = stockData.quantity - quantity;
      const stockRef = doc(db, 'stocks', stockId);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp()
      });

      // Create sale record
      const saleData = {
        itemCode: stockData.itemCode,
        brand: stockData.brand,
        model: stockData.model,
        storage: stockData.storage,
        color: stockData.color,
        stockId: stockId,
        quantity: quantity,
        originalPrice: salePrice,
        finalSalePrice: finalPrice,
        discountPercentage: discountPercentage,
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: currentLocation,
        saleType: 'standard',
        status: 'completed'
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      // Commit the batch
      await batch.commit();
      console.log('Item sold successfully');

      alert('Item sold successfully!');
      
    } catch (error) {
      console.error('Error selling item:', error);
      let errorMessage = 'Error selling item. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check if you have sales permissions.';
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Stock was modified by another user. Please try again.';
      }
      
      alert(errorMessage);
    }
  };

  // Utility functions
  const getFilteredStocks = () => {
    let filtered = stocks;
    
    if (searchTerm) {
      filtered = filtered.filter(stock => 
        stock.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.model?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterBrand) {
      filtered = filtered.filter(stock => stock.brand === filterBrand);
    }
    
    return filtered;
  };

  const getUniqueBrands = () => {
    return [...new Set(stocks.map(stock => stock.brand).filter(Boolean))];
  };

  const calculateTotalStockValue = () => {
    return stocks.reduce((total, stock) => {
      return total + ((parseFloat(stock.orderPrice) || 0) * (parseInt(stock.quantity) || 0));
    }, 0);
  };

  const getRoleBadgeColor = (role) => {
    return role === 'sales' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300';
  };

  // Loading state
  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center'>
        <div className='text-white'>Loading User Dashboard...</div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'>
      {/* Header */}
      <header className='bg-white/10 backdrop-blur-lg border-b border-white/20'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-4'>
            <div>
              <h1 className='text-2xl font-bold text-white'>
                KM ELECTRONICS <span className='text-blue-500'>User Dashboard</span>
              </h1>
              <p className='text-white/70 text-sm'>
                Welcome, {user?.fullName} | Location: {currentLocation}
                <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getRoleBadgeColor(user?.role)}`}>
                  {user?.role === 'sales' ? 'Sales Personnel' : 'Data Entry Clerk'}
                </span>
              </p>
            </div>
            
            <button
              onClick={() => signOut(auth).then(() => router.push('/login'))}
              className='bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors'
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <nav className='border-b border-white/20'>
          <div className='flex space-x-8 overflow-x-auto'>
            {['dashboard', 'stocks', 'quickSale', 'salesHistory'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                {tab === 'dashboard' && 'Dashboard'}
                {tab === 'stocks' && 'Stock & Sales'}
                {tab === 'quickSale' && 'Quick Sale'}
                {tab === 'salesHistory' && 'My Sales'}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <div className='py-6'>
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className='space-y-6'>
              {/* Analytics Cards */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Available Stock Value</h3>
                  <p className='text-2xl font-bold text-green-400'>
                    ₹{calculateTotalStockValue().toLocaleString()}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>My Total Sales</h3>
                  <p className='text-2xl font-bold text-blue-400'>
                    {salesAnalysis.totalSales}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>My Total Revenue</h3>
                  <p className='text-2xl font-bold text-purple-400'>
                    ₹{salesAnalysis.totalRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Monthly Revenue</h3>
                  <p className='text-2xl font-bold text-orange-400'>
                    ₹{salesAnalysis.monthlyRevenue?.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              {/* Quick Actions & Recent Sales */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Quick Actions */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Quick Actions</h2>
                  <div className='space-y-3'>
                    <button
                      onClick={() => setActiveTab('quickSale')}
                      className='w-full bg-blue-600 hover:bg-blue-700 text-blue-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>Quick Sale</div>
                      <div className='text-sm'>Process a sale by item code</div>
                    </button>
                    <button
                      onClick={() => setActiveTab('stocks')}
                      className='w-full bg-green-600 hover:bg-green-700 text-green-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>View Stock</div>
                      <div className='text-sm'>Browse and sell available items</div>
                    </button>
                  </div>
                </div>

                {/* Recent Sales */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Recent Sales</h2>
                  <div className='space-y-3'>
                    {sales.slice(0, 3).map((sale) => (
                      <div key={sale.id} className='bg-white/5 rounded-lg p-3 border border-white/10'>
                        <div className='flex justify-between items-start'>
                          <div>
                            <div className='font-semibold text-white'>{sale.brand} {sale.model}</div>
                            <div className='text-white/70 text-sm'>Qty: {sale.quantity}</div>
                          </div>
                          <div className='text-right'>
                            <div className='text-green-400 font-semibold'>₹{sale.finalSalePrice || 0}</div>
                            <div className='text-white/50 text-xs'>
                              {sale.soldAt?.toDate().toLocaleDateString() || 'Unknown date'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {sales.length === 0 && (
                      <div className='text-center py-8 text-white/70'>No sales yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock & Sales Tab */}
          {activeTab === 'stocks' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Available Stock - {currentLocation}</h2>
                <div className='text-white'>Total Value: ₹{calculateTotalStockValue().toLocaleString()}</div>
              </div>

              {/* Search and Filter */}
              <div className='flex flex-col md:flex-row gap-4 mb-6'>
                <input
                  type='text'
                  placeholder='Search by item code, brand, or model...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                />
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                >
                  <option value=''>All Brands</option>
                  {getUniqueBrands().map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterBrand(''); }}
                  className='bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'
                >
                  Clear
                </button>
              </div>

              {/* Stocks Table */}
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Brand & Model</th>
                      <th className='text-left py-2'>Sale Price</th>
                      <th className='text-left py-2'>Discount</th>
                      <th className='text-left py-2'>Available</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredStocks().map((stock) => {
                      const stockStatus = stock.quantity > 10 ? 'bg-green-500/20 text-green-300' :
                                        stock.quantity > 0 ? 'bg-orange-500/20 text-orange-300' :
                                        'bg-red-500/20 text-red-300';

                      return (
                        <tr key={stock.id} className='border-b border-white/10'>
                          <td className='py-2 font-mono'>{stock.itemCode}</td>
                          <td className='py-2'>
                            <div className='font-semibold'>{stock.brand} {stock.model}</div>
                            {stock.storage && <div className='text-white/70 text-sm'>Storage: {stock.storage}</div>}
                            {stock.color && <div className='text-white/70 text-sm'>Color: {stock.color}</div>}
                          </td>
                          <td className='py-2'>
                            <div className='text-green-400'>₹{stock.salePrice || 0}</div>
                            {stock.discountPercentage > 0 && (
                              <div className='text-orange-400 text-sm'>
                                After discount: ₹{(stock.salePrice * (1 - (stock.discountPercentage || 0) / 100)).toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className='py-2'>
                            {stock.discountPercentage > 0 ? (
                              <span className='text-orange-400'>{stock.discountPercentage}% OFF</span>
                            ) : (
                              <span className='text-white/50'>No discount</span>
                            )}
                          </td>
                          <td className='py-2'>
                            <span className={`px-2 py-1 rounded-full text-xs ${stockStatus}`}>
                              {stock.quantity || 0} units
                            </span>
                          </td>
                          <td className='py-2 space-x-2'>
                            <button
                              onClick={() => handleSellItem(stock.id, stock, 1)}
                              disabled={!stock.quantity || stock.quantity === 0}
                              className='bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors'
                            >
                              Sell 1
                            </button>
                            {stock.quantity > 1 && (
                              <button
                                onClick={() => {
                                  const quantity = prompt(`Enter quantity to sell (Available: ${stock.quantity}):`, '1');
                                  if (quantity && !isNaN(quantity) && parseInt(quantity) > 0) {
                                    handleSellItem(stock.id, stock, parseInt(quantity));
                                  }
                                }}
                                className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                              >
                                Sell Multiple
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {getFilteredStocks().length === 0 && (
                  <div className='text-center py-8 text-white/70'>
                    No stock items found matching your search criteria.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Sale Tab */}
          {activeTab === 'quickSale' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>Quick Sale</h2>
              
              <div className='max-w-md mx-auto space-y-6'>
                {/* Quick Sale Form */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Process Sale</h3>
                  <div className='space-y-4'>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Item Code</label>
                      <input
                        type='text'
                        placeholder='Enter item code...'
                        value={quickSale.itemCode}
                        onChange={(e) => setQuickSale({...quickSale, itemCode: e.target.value})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                      />
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Quantity</label>
                      <input
                        type='number'
                        min='1'
                        value={quickSale.quantity}
                        onChange={(e) => setQuickSale({...quickSale, quantity: parseInt(e.target.value) || 1})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                      />
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>
                        Custom Price (Optional)
                        <span className='text-white/50 text-xs ml-1'>- Leave empty for standard price</span>
                      </label>
                      <input
                        type='number'
                        placeholder='Enter custom price...'
                        value={quickSale.customPrice}
                        onChange={(e) => setQuickSale({...quickSale, customPrice: e.target.value})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                      />
                    </div>
                    <button
                      onClick={handleQuickSale}
                      disabled={!quickSale.itemCode}
                      className='w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors font-semibold'
                    >
                      Process Sale
                    </button>
                  </div>
                </div>

                {/* Recent Items */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Recent Items</h3>
                  <div className='space-y-2'>
                    {stocks.slice(0, 5).map((stock) => (
                      <div 
                        key={stock.id} 
                        className='flex justify-between items-center p-2 hover:bg-white/5 rounded cursor-pointer'
                        onClick={() => setQuickSale(prev => ({...prev, itemCode: stock.itemCode}))}
                      >
                        <div>
                          <div className='text-white font-mono text-sm'>{stock.itemCode}</div>
                          <div className='text-white/70 text-xs'>{stock.brand} {stock.model}</div>
                        </div>
                        <div className='text-right'>
                          <div className='text-green-400 text-sm'>₹{stock.salePrice || 0}</div>
                          <div className='text-white/50 text-xs'>{stock.quantity} available</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sales History Tab */}
          {activeTab === 'salesHistory' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>My Sales History</h2>
              
              {/* Sales Analytics */}
              <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-6'>
                <div className='bg-white/5 rounded-lg p-4'>
                  <h3 className='text-white/70 text-sm'>Total Sales</h3>
                  <p className='text-2xl font-bold text-white'>{salesAnalysis.totalSales}</p>
                </div>
                <div className='bg-white/5 rounded-lg p-4'>
                  <h3 className='text-white/70 text-sm'>Total Revenue</h3>
                  <p className='text-2xl font-bold text-green-400'>
                    ₹{salesAnalysis.totalRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-4'>
                  <h3 className='text-white/70 text-sm'>Monthly Revenue</h3>
                  <p className='text-2xl font-bold text-blue-400'>
                    ₹{salesAnalysis.monthlyRevenue?.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              {/* Sales Table */}
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item</th>
                      <th className='text-left py-2'>Quantity</th>
                      <th className='text-left py-2'>Final Price</th>
                      <th className='text-left py-2'>Sale Type</th>
                      <th className='text-left py-2'>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => {
                      const saleTypeClass = sale.saleType === 'custom_price' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300';
                      const saleTypeText = sale.saleType === 'custom_price' ? 'Custom Price' : 'Standard';

                      return (
                        <tr key={sale.id} className='border-b border-white/10'>
                          <td className='py-2'>
                            <div className='font-semibold'>{sale.brand} {sale.model}</div>
                            <div className='text-white/70 text-sm'>Code: {sale.itemCode}</div>
                          </td>
                          <td className='py-2'>{sale.quantity}</td>
                          <td className='py-2'>
                            <div className='text-green-400 font-semibold'>₹{sale.finalSalePrice || 0}</div>
                            {sale.customPrice && <div className='text-orange-400 text-sm'>Custom price</div>}
                          </td>
                          <td className='py-2'>
                            <span className={`px-2 py-1 rounded-full text-xs ${saleTypeClass}`}>
                              {saleTypeText}
                            </span>
                          </td>
                          <td className='py-2'>
                            {sale.soldAt?.toDate().toLocaleString() || 'Unknown date'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sales.length === 0 && (
                  <div className='text-center py-8 text-white/70'>No sales history found.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}