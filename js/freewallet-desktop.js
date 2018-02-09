/*********************************************************************
 * freewallet-desktop.js 
 *
 * Custom javascript for FreeWallet (desktop version)
 *********************************************************************/

// Setup some short aliases
var ls = localStorage,
    ss = sessionStorage,
    bc = bitcore;

// Define FreeWallet namespace
FW = {};

// Define object to hold data for dialog boxes
FW.DIALOG_DATA = {};

// Define list of API keys used
FW.API_KEYS = {
    BLOCKTRAIL: '781fc8d6bc5fc6a83334384eecd8c9917d5baf37'
};

// Load wallet network (1=Mainnet, 2=Testnet)
FW.WALLET_NETWORK = ls.getItem('walletNetwork') || 1;

// Load latest network information (btc/xcp price, fee info, block info)
FW.NETWORK_INFO =  JSON.parse(ls.getItem('networkInfo')) || {};

// Load current wallet address and address label
FW.WALLET_ADDRESS       = ls.getItem('walletAddress') || null;
FW.WALLET_ADDRESS_LABEL = ls.getItem('walletAddressLabel') || null;

// Array of the known wallet addresses any labels
FW.WALLET_ADDRESSES = JSON.parse(ls.getItem('walletAddresses')) || [];
// Example record
// {
//         address: '14PPCFzhQbMFyuUTRRqDnbt1gTVnXcCETi',
//         label: 'My Wallet Address'
//         network: 1, // 1=Mainnet, 2=Testnet
//         type: 1,    // 1=indexed, 2=privkey (imported), 3=watch-only
//         index: 0    // The index of the address
// }

FW.WALLET_KEYS      = {}; // Address/Private keys
FW.EXCHANGE_MARKETS = {}; // DEX Markets cache

// Load the last known wallet balances and history
FW.WALLET_BALANCES = JSON.parse(ls.getItem('walletBalances')) || [];
FW.WALLET_HISTORY  = JSON.parse(ls.getItem('walletHistory'))  || [];

// Define default server info
FW.WALLET_SERVER_INFO = {
    mainnet: {
        host: 'public.coindaddy.io',
        port: 4001,                 
        user: 'rpc',                
        pass: '1234',               
        ssl: true,
        api_host: 'xchain.io',
        api_ssl: true
    },
    testnet: {
        host: 'public.coindaddy.io',
        port: 14001,                
        user: 'rpc',                
        pass: '1234',               
        ssl: true,
        api_host: 'testnet.xchain.io',
        api_ssl: true
    }
};

// Define the default and base markets for the Decentralized Exchange (DEX)
FW.DEFAULT_MARKETS = ['BTC','XCP','BITCRYSTALS','PEPECASH','WILLCOIN'];
FW.BASE_MARKETS    = JSON.parse(ls.getItem('walletMarkets')) || FW.DEFAULT_MARKETS;

// Define the default market viewing options (hide numeric by default)
FW.MARKET_OPTIONS  = JSON.parse(ls.getItem('walletMarketOptions')) || [1,2]; // 1=named, 2=subasset, 3=numeric 

// Define arrays to hold BTCPay information
FW.BTCPAY_ORDERS  = JSON.parse(ls.getItem('btcpayOrders'))  || {}; // array of order tx_hashes to monitor for BTCpay transactions
FW.BTCPAY_MATCHES = JSON.parse(ls.getItem('btcpayMatches')) || {}; // array of order matches that have seen/processed
FW.BTCPAY_QUEUE   = JSON.parse(ls.getItem('btcpayQueue'))   || {}; // Array of btcpay transactions to process
// Example of how BTCPAY data is stored 
// FW.BTCPAY_ORDERS[network][address][order_hash] = autopay;                        // (autopay 0=false, 1=true)
// FW.BTCPAY_MATCHES[network][order_hash]         = [order_match1, order_match2];   // Array of order match transactions that have been seen/added to queue
// FW.BTCPAY_QUEUE[network]                       = [{ tx_info },{ tx_info }];      // Array of btcpay transactions to process

// Define cache for asset information
// We cache the data in order to reduce duplicate API calls as much as possible
FW.ASSET_INFO  = {};
// Example of cached asset data
// FW.ASSET_INFO['BTC'] = {
//     block:     0, // Block # when data was last updated
//     ...
// }

// Define cache for reputation information ()
// We cache the data in order to reduce duplicate API calls as much as possible
FW.REPUTATION_INFO  = {};
// Example of cached reputation data
// FW.REPUTATION_INFO['BTC'] = {
//     block:     0, // Block # when data was last updated
//     ...
// }

// Define cache for market information
// We cache the data in order to reduce duplicate API calls as much as possible
FW.MARKET_DATA = {}; 
// Example of cached market data
// FW.MARKET_DATA['BTC/XCP'] = {
//     block:      0, // Block # when data was last updated
//     basics:    {}, // Basics (last price, high/low, volume)
//     orderbook: {}, // Full Orderbook
//     history:   {}, // Full History
//     trades:    {}, // My Trades
//     orders:    {}, // My Open Orders
//     chart:     {}, // Chart data
// }


// Start loading the wallet 
$(document).ready(function(){

    // Quick hack to blow away any old data from freewallet.io/browser
    var old = ls.getItem("Balances");
    if(old){
        ls.clear();
        ss.clear();
        window.location.reload();
    }

    // If user has not already agreed to license agreement, display it
    if(parseInt(ls.getItem('licenseAgreementAccept'))!=1)
        dialogLicenseAgreement();

    // Load the server information
    var info = ls.getItem('serverInfo');
    if(info)
        FW.WALLET_SERVER_INFO = JSON.parse(info);

    // Setup the xchain API url
    setXChainAPI(FW.WALLET_NETWORK);

    // Initialize the wallet 
    initWallet();

});

// Handle changing theme
function setTheme( theme ) {
    var body = $('body');
    body.removeClass();
    body.addClass(theme);        
}

// Handle getting XChain API url for given network
function getXChainAPI( network ){
    var name = (network==2||network=='testnet') ? 'testnet' : 'mainnet',
        o    = FW.WALLET_SERVER_INFO[name],
        url  = ((o.api_ssl) ? 'https' : 'http') + '://' + o.api_host;
    return url;
}

// Handle setting server information based off current network
function setXChainAPI( network ){
    FW.XCHAIN_API = getXChainAPI(network);
}

// Handle loading content into the main panel
function loadPage(page){
    var html = page + '.html';
    // For bounty features, only allow paid users access until bounty is fully funded
    if(['exchange','market','betting'].indexOf(page)!=-1){
        var allow = checkTokenAccess(page);
        if(page=='exchange') html = (allow) ? 'exchange/markets.html' : 'exchange.html';
        if(page=='market')   html = (allow) ? 'exchange/market.html' : 'exchange.html';
        if(page=='betting')  html = (allow) ? 'betting.html' : 'betting.html';
    }
    // Load the page content and switch the tab to active
    $('#main-content-panel').load('html/' + html);
    $('.header .navbar-nav li > a').removeClass('active');
    $('#' + page).addClass('active');
}

// Initialize / Load the wallet
function initWallet(){
    if(ss.getItem('wallet') == null){
        if(ls.getItem('wallet')){
            if(parseInt(ls.getItem('walletEncrypted'))==1){
                // Try to unlock the wallet when app first opens
                // if(parseInt(ss.getItem('skipWalletAuth'))!=1)
                //     dialogPassword();
            } else {
                decryptWallet();
            }
        } else {
            dialogWelcome();
        }
    } else {
        // Decrypt the wallet using the current password (do this so we populate FW.WALLET_KEYS)
        decryptWallet(getWalletPassword());
    }
    // Check if we have everything needed to authorize Auto-BTCpay transactions
    checkBtcpayAuth();
    // Trigger an immediate check of if we need to update the wallet information (prices/balances)
    checkUpdateWallet();
    // Check every 60 seconds if we should update the wallet information
    setInterval(checkUpdateWallet, 60000);
    updateWalletOptions();
}


// Reset/Remove wallet
function resetWallet(){
    ls.removeItem('wallet');
    ls.removeItem('walletKeys');
    ls.removeItem('walletPassword');
    ls.removeItem('walletEncrypted');
    ls.removeItem('walletAddress');
    ls.removeItem('walletAddresses');
    ls.removeItem('walletAddressLabel');
    ls.removeItem('walletBalances');
    ls.removeItem('walletHistory');
    ls.removeItem('walletNetwork');
    ls.removeItem('walletMarkets');
    ls.removeItem('btcpayOrders');
    ls.removeItem('btcpayMatches');
    ls.removeItem('btcpayQueue');
    ss.removeItem('btcpayWallet');
    ss.removeItem('wallet');
    ss.removeItem('walletPassword');
    ss.removeItem('skipWalletAuth');
    FW.WALLET_BALANCES  = [];
    FW.WALLET_HISTORY   = [];
    FW.WALLET_KEYS      = {};
    FW.BTCPAY_ORDERS    = {};
    FW.BTCPAY_MATCHES   = {};
    FW.BTCPAY_QUEUE     = {};
    FW.BTCPAY_ORDERS    = {}
    FW.BASE_MARKETS     = FW.DEFAULT_MARKETS;
}

// Create HD wallet
function createWallet( passphrase ){
    var m = new Mnemonic(128);
    if(passphrase)
        m = Mnemonic.fromWords(passphrase.trim().split(" "));
    var wallet    = m.toHex(),
        password  = Math.random().toString(36).substring(3), // Generate random password
        privkeys  = JSON.stringify(FW.WALLET_KEYS),
        encWallet = CryptoJS.AES.encrypt(wallet, String(password)).toString(),
        encKeys   = CryptoJS.AES.encrypt(privkeys, String(password)).toString();
    ss.setItem('wallet', wallet);
    ss.setItem('walletPassword', password);
    ls.setItem('wallet', encWallet);
    ls.setItem('walletKeys', encKeys);
    ls.setItem('walletPassword', password);
    ls.setItem('walletEncrypted',0);
    ls.setItem('walletNetwork',1);
    ss.removeItem('skipWalletAuth');
    // Add the first 10 addresses to the wallet (both mainnet and testnet)
    var networks = ['mainnet','testnet'];
    networks.forEach(function(net){
        var network = bitcore.Networks[net];
        var s = bc.HDPrivateKey.fromSeed(wallet, network);
        for(var i=0;i<10;i++){
            var d = s.derive("m/0'/0/" + i),
                a = bc.Address(d.publicKey, network).toString();
            addWalletAddress(net, a, 'Address #' + (i + 1), 1, i);
        }
    });
    // Set current address to first address in wallet
    // This also handles saving TBE.WALLET_ADDRESSES to disk
    setWalletAddress(getWalletAddress(0), true);
}

// Handle generating a new indexed address and adding it to the wallet
function addNewWalletAddress(net=1){
    // Force network to numeric value and net to string value
    var ls  = localStorage;
    net     = (net=='testnet' || net==2) ? 2 : 1;
    network = (net==2) ? 'testnet' : 'mainnet';
    address = false;
    // Lookup the highest indexed address so far
    var idx = 0;
    FW.WALLET_ADDRESSES.forEach(function(item){
        if(item.type==1 && item.network==net && item.index>idx)
            idx = item.index;
    });
    idx++; // Increase index for new address
    // Generate new address
    var w = getWallet(),
        b = bitcore,
        n = b.Networks[network],
        s = b.HDPrivateKey.fromSeed(w, n),
        d = s.derive("m/0'/0/" + idx);
    address = b.Address(d.publicKey, n).toString();
    // Add the address to the wallet
    addWalletAddress(network, address, 'Address #' + (idx + 1), 1, idx);
    // Save wallet addresses info to disk
    ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
    return address;
}

// Decrypt wallet
function decryptWallet( password ){
    var encWallet = ls.getItem('wallet'),
        encKeys   = ls.getItem('walletKeys') || '',
        password  = (password) ? password : ls.getItem('walletPassword'),
        wallet    = CryptoJS.AES.decrypt(encWallet, String(password)).toString(CryptoJS.enc.Utf8),
        privkeys  = CryptoJS.AES.decrypt(encKeys, String(password)).toString(CryptoJS.enc.Utf8);
    // Save wallet to session storage
    ss.setItem('wallet', wallet);
    // Parse private keys into FW.WALLET_KEYS
    FW.WALLET_KEYS = JSON.parse(privkeys);
    // Save the current wallet password (so we can re-encrypt things without needing to re-prompt the user for pass)
    ss.setItem('walletPassword', password);
    // Remove any skip wallet authorization flag
    ss.removeItem('skipWalletAuth');
}

// Decrypt wallet
function encryptWallet( password, skip=false ){
    var wallet    = getWallet(),
        password  = (password) ? password : ls.getItem('walletPassword'),
        privkeys  = JSON.stringify(FW.WALLET_KEYS),
        encWallet = CryptoJS.AES.encrypt(wallet, String(password)).toString(),
        encPass   = CryptoJS.AES.encrypt(password, String(password)).toString(),
        encKeys   = CryptoJS.AES.encrypt(privkeys, String(password)).toString();
    // Save the encrypted data to disk
    ls.setItem('wallet', encWallet);
    // Mark wallet as encrypted and save encrypted password unless instructed not to
    if(!skip){
        ls.setItem('walletEncrypted',1);
        ls.setItem('walletPassword', encPass);
    }
    ls.setItem('walletKeys', encKeys);
    // Remove any skip wallet authorization flag
    ss.removeItem('skipWalletAuth');
}

// Get decrypted wallet from sessionStorage
function getWallet(){
    return ss.getItem('wallet');
}

// Get decrypted wallet password from sessionStorage
function getWalletPassword(){
    return ss.getItem('walletPassword');
}

// Get 12-word passphrase
function getWalletPassphrase(){
    var w = getWallet();
    if(w)
        return Mnemonic.fromHex(w).toWords().toString().replace(/,/gi, " ");
    return false;
}

// Handle locking wallet by removing decrypted wallet from sessionStorage
function lockWallet(){
    ss.removeItem('wallet');
    ss.removeItem('walletPassword')
    FW.WALLET_KEYS = {};
}

// Get wallet addresses using given index 
function getWalletAddress( index ){
    // console.log('getWalletAddress index=',index);
    // update network (used in CWBitcore)
    var net = (FW.WALLET_NETWORK==2) ? 'testnet' : 'mainnet',
    NETWORK = bitcore.Networks[net];
    if(typeof index === 'number'){
        // var type
        var w = getWallet(),
            a = null;
        if(w){
            k = bc.HDPrivateKey.fromSeed(w, NETWORK),
            d = k.derive("m/0'/0/" + index),
            a = bc.Address(d.publicKey, NETWORK).toString();
        } else {
            dialogMessage('<i class="fa fa-lg fa-fw fa-exclamation-circle"></i> Error(s)', errors.join('<br/>') );
        }
        return a;
    } else {
        return ls.getItem('walletAddress');
    }
}

// Set wallet address
function setWalletAddress( address, load=0 ){
    // console.log('setWalletAddress address, load=',address,load);
    FW.WALLET_ADDRESS = address;
    var info = getWalletAddressInfo(address);
    if(!info)
        info = addWalletAddress(address);
    // Save the label info to disk
    FW.WALLET_ADDRESS_LABEL = info.label;
    // Save updated information to disk
    ls.setItem('walletAddress', address);
    ls.setItem('walletAddressLabel', info.label);
    ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
    // Update the wallet display to reflect the new address
    updateWalletOptions();
    if(load)
        checkUpdateWallet();
}

// Handle adding addresses to FW.WALLET_ADDRESSES array
function addWalletAddress( network=1, address='', label='', type=1, index='' ){
    // console.log('addWalletAddress network,address,label,type,index=',network,address,label,type,index);
    if(address=='')
        return;
    // Convert network to integer value
    if(typeof network == 'string')
        network = (network=='testnet') ? 2 : 1;
    var info = {
        address: address, // Address to add
        network: network, // Default to mainnet (1=mainnet, 2=testnet)
        label: label,     // Default to blank label
        type: type,       // 1=indexed, 2=imported (privkey), 3=watch-only
        index: index      // wallet address index (used in address sorting)
    };
    FW.WALLET_ADDRESSES.push(info);
    return info;
}

// Handle removing an address from the wallet
function removeWalletAddress( address ){
    // Remove the address from FW.WALLET_ADDRESSES array
    var arr = [];
    FW.WALLET_ADDRESSES.forEach(function(item){
        if(item.address!=address)
            arr.push(item);
    });
    FW.WALLET_ADDRESSES = arr;
    // Remove any private keys associated with the address
    if(FW.WALLET_KEYS[address])
        delete FW.WALLET_KEYS[address];
    // Save wallet addresses info to disk
    ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
    // Re-encrypt the wallet with the last known valid password
    encryptWallet(getWalletPassword(), true);
}

// Handle returning the information from TBE.WALLET_ADDRESSES for a given address
function getWalletAddressInfo( address ){
    var info = false;
    FW.WALLET_ADDRESSES.forEach(function(item){
        if(item.address==address)
            info = item;
    });
    return info;
}

// Handle updating wallet address labels (friendly names)
function setWalletAddressLabel( address, label ){
    FW.WALLET_ADDRESSES.forEach(function(item, idx){
        if(item.address==address)
            FW.WALLET_ADDRESSES[idx].label = label;
    });
    // Save the label info to disk
    FW.WALLET_ADDRESS_LABEL = label;
    ls.setItem('walletAddressLabel', label);
    // Save updated wallet addresses array to disk
    ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
}

// Handle setting the wallet network (1=mainnet/2=testnet)
function setWalletNetwork(network, load=false){
    ls.setItem('walletNetwork', network);
    FW.WALLET_NETWORK = network;
    // Reset exchange/market/asset/reputation info
    FW.EXCHANGE_MARKETS = {};
    FW.ASSET_INFO       = {};
    FW.REPUTATION_INFO  = {};
    // Update the xchain API url
    setXChainAPI(network);
    // Set current address to first address in wallet
    setWalletAddress(getWalletAddress(0), load);
}

// Handle adding private key to wallet
function addWalletPrivkey(key){
    // Verify that the private key is added
    var net     = FW.WALLET_NETWORK,                // Numeric
        network = (net==2) ? 'testnet' : 'mainnet', // Text
        ls      = localStorage,
        bc      = bitcore,
        n       = bc.Networks[network],
        address = false;
    // Try to generate a public key and address using the key
    try {
        privkey = new bc.PrivateKey.fromWIF(key);
        pubkey  = privkey.toPublicKey();
        address = pubkey.toAddress(n).toString();
    } catch (e){
        console.log('error : ',e);
    }
    // Add wallet to address
    if(address){
        // Check if the address has alreaday been added to the list
        var found = false,
            cnt   = 0;
        FW.WALLET_ADDRESSES.forEach(function(item){
            if(item.address==address)
                found = true;
            if(item.network==net && item.type==2)
                cnt++;
        });
        if(!found){
            // Add the address to the wallet 
            addWalletAddress(network, address, 'Imported Address #' + (cnt + 1), 2, null);
            // Save wallet addresses info to disk
            ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
            // Add address and private key to keys array
            FW.WALLET_KEYS[address] = key;
            // Re-encrypt the wallet with the last known valid password
            encryptWallet(getWalletPassword(), true);
        }
    }
    return address;
}

// Validate wallet password
function isValidWalletPassword( password ){
    var p = ls.getItem('walletPassword'),
        d = false;
    // Try to decrypt the encrypted password using the given password
    try {
        d = CryptoJS.AES.decrypt(p, String(password)).toString(CryptoJS.enc.Utf8);
    } catch(e){
    }
    if(d==password)
        return true
    return false;
}

// Validate wallet passphrase
function isValidWalletPassphrase( passphrase ){
    var arr   = passphrase.trim().split(" "),
        valid = true;
    if(arr.length<12)
        valid = false;
    for(var i=0;i<arr.length;i++){
        if($.inArray(arr[i], Mnemonic.words)==-1)
            valid = false;
    }
    return valid;
}

// Validate address
function isValidAddress(addr){
    var net  = (FW.WALLET_NETWORK==2) ? 'testnet' : 'mainnet';
    // update network (used in CWBitcore)
    NETWORK  = bitcore.Networks[net];
    if(CWBitcore.isValidAddress(addr))
        return true;
    return false;
}

// Validate if we are running in nwjs or not
function is_nwjs(){
    try{
        return (typeof require('nw.gui') !== "undefined");
    } catch (e){
        return false;
    }
}

// Display correct wallet options based on wallet status
function updateWalletOptions(){
    // Handle updating lock/unlock icon based on state
    var icon = $('#lock > i'),
        lock = $('#lock');
    if(!ss.getItem('wallet')){
        icon.removeClass('fa-unlock').addClass('fa-lock');
        lock.attr('data-original-title','<div class="nowrap">Unlock Wallet</div>');
    } else {
        icon.removeClass('fa-lock').addClass('fa-unlock');
        lock.attr('data-original-title', '<div class="nowrap">Lock Wallet</div>');
    }
    // Handle updating the settings screen
    $('#settings-address').val(FW.WALLET_ADDRESS);
    $('#settings-network').val(FW.WALLET_NETWORK);
    $('#settings-address-label').val(FW.WALLET_ADDRESS_LABEL);
    // Handle updating footer info
    var net   = (FW.WALLET_NETWORK==2) ? 'testnet' : 'mainnet';
        last  = ls.getItem('networkInfoLastUpdated') || '',
        block = (FW.NETWORK_INFO.network_info) ? FW.NETWORK_INFO.network_info[net].block_height : 'NA';
    $('.footer-current-block').text('Block ' + numeral(block).format('0,0'));
    $('.footer-last-updated').html('Last updated <span data-livestamp='  + last.substr(0,last.length-3) + ' class="nowrap"></span>');
    $('.footer-current-price').text('$' + numeral(getAssetPrice('XCP')).format('0,0.00') + ' USD');
    var info = getWalletAddressInfo(FW.WALLET_ADDRESS);
    if(info.type==3){
        $('#action-view-privkey').hide();
        $('#action-send').hide();
        $('#action-sign-message').hide();
        $('#action-sign-transaction').hide();
        $('#action-dividend').hide();
        $('#action-broadcast-message').hide();
        $('#header-token-actions').hide();
        $('#action-asset-create').hide();
        $('#action-asset-description').hide();
        $('#action-asset-supply').hide();
        $('#action-asset-transfer').hide();
        $('#action-asset-lock').hide();
    } else {
        $('#action-view-privkey').show();
        $('#action-send').show();
        $('#action-sign-message').show();
        $('#action-sign-transaction').show();
        $('#action-dividend').show();
        $('#action-broadcast-message').show();
        $('#header-token-actions').show();
        $('#action-asset-create').show();
        $('#action-asset-description').show();
        $('#action-asset-supply').show();
        $('#action-asset-transfer').show();
        $('#action-asset-lock').show();
    }
}

// Handle looking up asset price from FW.NETWORK_INFO
function getAssetPrice(id, full){
    var price = false;
    for(var key in FW.NETWORK_INFO.currency_info){
        var item = FW.NETWORK_INFO.currency_info[key];
        if(item.id==id||item.symbol==id||name==id){
            if(full)
                price = item;
            else
                price = item.price_usd;
        }
    }
    return price;
}

// Handle retrieving asset information from xchain and handing the data to a callback function
// We cache the information between blocks to reduce the number of duplicate API calls
function getAssetInfo(asset, callback, force){
    var net    = (FW.WALLET_NETWORK==2)  ? 'testnet' : 'mainnet',
        block  = (FW.NETWORK_INFO.network_info) ? FW.NETWORK_INFO.network_info[net].block_height : 1,
        data   = FW.ASSET_INFO[asset] || false,
        last   = (data) ? data.block : 0,
        update = (block > last || force) ? true : false;
    // Initialize the asset data cache
    if(!FW.ASSET_INFO[asset])
        FW.ASSET_INFO[asset] = {}
    if(update){
        $.getJSON( FW.XCHAIN_API + '/api/asset/' + asset, function( data ){
            data.block = block;
            FW.ASSET_INFO[asset] = data;
            if(typeof callback === 'function')
                callback(data);
        });
    } else {
        callback(data);
    }
}


// Handle retrieving asset reputation info from coindaddy and handing the data to a callback function
// We cache the information between blocks to reduce the number of duplicate API calls
function getAssetReputationInfo(asset, callback, force){
    var net    = (FW.WALLET_NETWORK==2)  ? 'testnet' : 'mainnet',
        block  = (FW.NETWORK_INFO.network_info) ? FW.NETWORK_INFO.network_info[net].block_height : 1,
        data   = FW.REPUTATION_INFO[asset] || false,
        last   = (data) ? data.block : 0,
        update = (block > last || force) ? true : false;
    // Initialize the asset data cache
    if(!FW.REPUTATION_INFO[asset])
        FW.REPUTATION_INFO[asset] = {}
    if(update){
        $.getJSON('https://reputation.coindaddy.io/api/asset/xcp/' + asset, function( data ){
            data.block = block;
            FW.REPUTATION_INFO[asset] = data;
            if(typeof callback === 'function')
                callback(data);
        });
    } else {
        callback(data);
    }
}

// Check if wallet price/balance info should be updated
function checkUpdateWallet(){
    updateNetworkInfo();
    checkBtcpayTransactions();  
    var addr = getWalletAddress();
    if(addr){
        updateWalletBalances(addr);
        updateWalletHistory(addr);
    }
};

// Handle checking for special tokens to enable access to features
// Check access each time a feature is accessed instead of setting a localStorage flag (make it a pain to access feature without access token)
function checkTokenAccess(feature){
    var assets = ['XCHAINPEPE','FULLACCESS'],
        access = false;
    // Loop through all addresses except watch-only addresses (ownership not proven)
    FW.WALLET_ADDRESSES.forEach(function(item){
        if(item.type!=3){
            FW.WALLET_BALANCES.forEach(function(itm){
                if(itm.address==item.address){
                    itm.data.forEach(function(balance){
                        if(assets.indexOf(balance.asset)!=-1 && parseFloat(balance.quantity)>=1)
                            access = true;
                    });
                }
            });
        }
    });
    return access;
}

// Handle verifying that we have wallet seed available for BTCpay transactions
function checkBtcpayAuth(){
    // console.log('checkBtcpayAuth FW.BTCPAY_ORDERS=',FW.BTCPAY_ORDERS);
    var enabled = false;
    $.each(['mainnet','testnet'],function(ndx, network){
        $.each(FW.BTCPAY_ORDERS[network], function(address, orders){
            $.each(orders, function(order, autopay){
                if(autopay==1)
                    enabled = true;
            });
        });
    });
    // If Auto-BTCpay is enabled, make sure we have unlocked wallet available
    var a = ss.getItem('btcpayWallet'),
        b = ss.getItem('wallet');
    if(enabled && a==null){
        if(b){
            ss.setItem('btcpayWallet',b);
        } else {
            dialogEnableBtcpay();
        }
    }
}

// Check the status of any btcpay transactions
function checkBtcpayTransactions( force ){
    // console.log('checkBtcpayTransactions');
    var ls   = localStorage,
        last = ls.getItem('btcpayLastUpdated') || 0,
        ms   = 300000,  // 5 minutes
        save = false;
    // Handle requesting updated order match information
    if((parseInt(last) + ms)  <= Date.now() || force ){
        $.each(['mainnet','testnet'], function(idx, network){
            $.each(FW.BTCPAY_ORDERS[network],  function(address, orders){
                // Only request data if we have orders to monitor
                if(Object.keys(orders).length){
                    // Set XChain url
                    var info = FW.WALLET_SERVER_INFO[network],
                        host = ((info.api_ssl) ? 'https' : 'http') + '://' + info.api_host;
                        url  = host + '/api/order_matches/' + address;
                    // Request order match data for the given address
                    $.getJSON(url, function(o){
                        if(!o.error){
                            $.each(o.data,function(ndx,data){
                                $.each(orders, function(order, autopay){
                                    // Find any pending order matches that we care about
                                    if(data.status=='pending' && (data.tx0_hash==order||data.tx1_hash==order)){
                                        var tx  = (data.tx0_hash==order) ? data.tx1_hash : data.tx0_hash,           // tx hash of the other side of the order match
                                            src = (data.tx0_hash==order) ? data.tx0_address : data.tx1_address;     // source address for our order
                                        // Initialize the BTCPAY objects if needed
                                        if(!FW.BTCPAY_QUEUE[network])
                                            FW.BTCPAY_QUEUE[network] = [];
                                        if(!FW.BTCPAY_MATCHES[network])
                                            FW.BTCPAY_MATCHES[network] = {};
                                        if(!FW.BTCPAY_MATCHES[network][order])
                                            FW.BTCPAY_MATCHES[network][order] = [];
                                        // Detect any orders we have not already seen
                                        if(FW.BTCPAY_MATCHES[network][order].indexOf(tx)==-1){
                                            // Add tx hash to BTCPAY_MATCHES so we know we have already detected this transaction
                                            FW.BTCPAY_MATCHES[network][order].push(tx);
                                            // Add tx info to BTCPAY_QUEUE so we can process
                                            data.autopay = autopay;
                                            data.source  = src;
                                            FW.BTCPAY_QUEUE[network].push(data);
                                            // Set flag to indicate we should save updated data
                                            save = true;
                                        }
                                    }
                                });
                            });
                            // Save updated data to disk
                            if(save){
                                ls.setItem('btcpayMatches',JSON.stringify(FW.BTCPAY_MATCHES));
                                ls.setItem('btcpayQueue',JSON.stringify(FW.BTCPAY_QUEUE));
                            }
                            // Handle processing any BTCpay transaction
                            processBtcpayQueue();
                        }
                    });
                }
            });
        });
        ls.setItem('btcpayLastUpdated', Date.now());
    } else {
        // Handle processing any BTCpay transactions in the queue
        processBtcpayQueue();
    }
}

// Handle cleaning up BTCPAY data
// - removes expired order matches from FW.BTCPAY_QUEUE 
// - removes expired order match data from FW.BTCPAY_MATCHES
// - removes expired orders from FW.BTCPAY_ORDERS
function cleanupBtcpay(){
    // console.log('cleanupBtcpayQueue FW.BTCPAY_QUEUE=',FW.BTCPAY_QUEUE);
    var last = ls.getItem('btcpayLastCleanup') || 0,
        ms   = 3600000; // 60 minutes
    // Loop through queue and process
    $.each(['mainnet','testnet'], function(ndx, network){
        // Remove expired order matches from the queue
        var arr = [],
            len = (FW.BTCPAY_QUEUE[network]) ? FW.BTCPAY_QUEUE[network].length : 0;
        $.each(FW.BTCPAY_QUEUE[network], function(idx, o){
            if(FW.NETWORK_INFO.network_info[network].block_height < o.expire_index)
                arr.push(o);
        });
        FW.BTCPAY_QUEUE[network] = arr;
        // Save to disk if we detected any changes 
        if(len!=arr.length)
            ls.setItem('btcpayQueue',JSON.stringify(FW.BTCPAY_QUEUE));
        // Remove expired orders from BTCPAY_ORDERS and BTCPAY_MATCHES
        if((parseInt(last) + ms)  <= Date.now()){
            var host = getXChainAPI(network);
            $.each(FW.BTCPAY_ORDERS[network], function(address, orders){
                $.each(orders, function(order, autopay){
                    $.getJSON( host + '/api/tx/' + order, function(data){
                        // Remove order if tx is mined and status is anything other than 'open'
                        if(data && data.block_index && data.status && data.status!='open')
                            removeFromBtcpayOrders(order);
                    });
                });
            });
            // Save last time we ran order expiration check
            ls.setItem('btcpayLastCleanup', Date.now());
        }
    });
}

// Handle locating and removing a specific order from future monitoring
function removeFromBtcpayOrders(order_hash){
    // console.log('removeFromBtcpayOrders order_hash=',order_hash);
    $.each(['mainnet','testnet'], function(ndx, network){
        // Remove order data from FW.BTCPAY_ORDERS
        $.each(FW.BTCPAY_ORDERS[network], function(address, orders){
            var obj = {};
            $.each(orders, function(order, autopay){
                if(order!=order_hash)
                    obj[order] = autopay;
            });
            FW.BTCPAY_ORDERS[network][address] = obj;
        });
        // Remove order data from FW.BTCPAY_MATCHES
        $.each(FW.BTCPAY_MATCHES[network], function(order, matches){
            if(FW.BTCPAY_MATCHES[network][order])
                delete FW.BTCPAY_MATCHES[network][order];
        });
    });
    // Save updated data to disk
    ls.setItem('btcpayOrders',JSON.stringify(FW.BTCPAY_ORDERS));
    ls.setItem('btcpayMatches',JSON.stringify(FW.BTCPAY_MATCHES));
}

// Handle locating and removing a specific order from the queue
function removeFromBtcpayQueue(tx0_hash, tx1_hash){
    // console.log('removeFromBtcpayQueue x0_hash, tx1_hash=',x0_hash, tx1_hash);
    $.each(['mainnet','testnet'], function(ndx, network){
        $.each(FW.BTCPAY_QUEUE[network], function(idx, o){
            if((o.tx0_hash==tx0_hash && o.tx1_hash==tx1_hash)||o.tx0_hash==tx1_hash && o.tx1_hash==tx0_hash){
                FW.BTCPAY_QUEUE[network].splice(idx,1);
                // Save the updated queue to disk and bail out
                ls.setItem('btcpayQueue',JSON.stringify(FW.BTCPAY_QUEUE));
                return false;
            }
        });
    });
}

// Handle processing BTCPayment queue one item at a time
function processBtcpayQueue(){
    // console.log('processBtcpayQueue FW.BTCPAY_QUEUE=',FW.BTCPAY_QUEUE);
    cleanupBtcpay();
    // Set placeholder to hold data on first manual btcpay tx 
    var data = false,
        a    = ss.getItem('wallet'),
        b    = ss.getItem('btcpayWallet');
    // Loop through queue and process any valid order matches
    $.each(['mainnet','testnet'], function(ndx, network){
        $.each(FW.BTCPAY_QUEUE[network], function(idx, o){
            if(o.autopay && (a||b)){
                autoBtcpay(network, o);
            } else {
                data = o;
                data.network = network; 
                return false; // bail out on first match
            }
        });
    });
    // If we detected a transaction which needs manual processing, display the dialog box to the user
    if(data){
        // Check if the BTCPay dialog box is visible... if so, bail out
        if($('#btcpay-form').length)
            return;
        FW.DIALOG_DATA = data;
        dialogBTCpay(false);
    }
}

// Handle automatically generating/signing/broadcasting a BTCpay transaction 
function autoBtcpay(network, o){
    // console.log('autoBtcpay network, o=', network, o);
    var a       = ss.getItem('wallet'),
        b       = ss.getItem('btcpayWallet'),
        c       = false, // Flag to indicate if we should delete wallet after tx
        id      = o.tx0_hash + '_' + o.tx1_hash,
        fee     = FW.NETWORK_INFO.fee_info.optimal, // Use high priority fee for order matches
        size    = 350,                              // 1 input is about 300 bytes... (TODO - Get actual tx size via pre-flight check)
        fee_sat = getSatoshis(((fee / 1000) * size) * 0.00000001);
    // Check status of the wallet and hot-swap wallet into place if needed
    if(a==null){
        // If no wallet/btcpayWallet is found, bail out
        if(b==null){
            return;
        } else {
            ss.setItem('wallet',b);
            c = true;
        }
    }
    // Handle automatically creating/signing/broadcasting the BTCpay tx
    cpBtcpay(network, o.source, id, fee_sat, function(tx){
        // Only proceed if we have a valid tx hash for the broadcast tx... otherwise leave in queue so we can try again
        if(tx){
            dialogMessage('<i class="fa fa-lg fa-check"></i> BTCPay Successful', '<center>Your BTC payment has been broadcast to the network and your order should complete shortly.' +
                          '<br/><br/><a class="btn btn-success" href="' + FW.XCHAIN_API + '/tx/' + tx + '" target="_blank">View Transaction</a></center>');
            // Remove the order match from the queue and check the queue again after a brief delay
            removeFromBtcpayQueue(o.tx0_hash, o.tx1_hash);
            setTimeout(function(){ processBtcpayQueue(); },1000);
        }
        // Handle removing the wallet if needed
        if(c)
            ss.removeItem('wallet');
    });      
}

// Update address balances
function updateWalletBalances( address, force ){
    var addr  = (address) ? address : FW.WALLET_ADDRESS,
        net   = (FW.WALLET_NETWORK==2) ? 'tbtc' : 'btc',
        net2  = (FW.WALLET_NETWORK==2) ? 'BTCTEST' : 'BTC',
        info  = getAddressBalance(addr) || {},
        last  = info.lastUpdated || 0,
        ms    = 300000, // 5 minutes
        btc   = false,  // Flag to indicate if BTC update is done
        xcp   = false;  // Flag to indicate if XCP update is done
    // Handle updating BTC and XCP asset balances
    if((parseInt(last) + ms)  <= Date.now() || force){
        // console.log('updating wallet balances');
        // Callback to handle saving data when we are entirely done 
        var doneCb = function(info){
            if(btc && xcp){
                // Sort array to show items in the following order
                // BTC & XCP 1st and second
                // Alphabetical order for asset name
                info.data.sort(function(a,b){
                    if(a.asset.length==3 && b.asset.length>3)
                        return -1;
                    if(a.asset.length>3 && b.asset.length==3)
                        return 1;
                    if(a.asset.length==3 && b.asset.length==3){
                        if(a < b)
                            return -1;
                        if(a > b)
                            return 1;
                    } else {
                        var strA = (a.asset_longname && a.asset_longname!='') ? a.asset_longname : a.asset,
                            strB = (b.asset_longname && b.asset_longname!='') ? b.asset_longname : b.asset;
                        if(strA < strB)
                            return -1;
                        if(strA > strB)
                            return 1;
                    }
                    return 0;
                });
                var arr = [info];
                FW.WALLET_BALANCES.forEach(function(item){
                    if(item.address!=addr)
                        arr.push(item);
                });
                FW.WALLET_BALANCES = arr;
                ls.setItem('walletBalances',JSON.stringify(FW.WALLET_BALANCES));
                updateBalancesList();
            }
        }
        // Define default record
        var info = {
            address: addr,
            data: [],
            lastUpdated: Date.now()
        }
        // Get BTC/XCP currency info
        var btc_info = getAssetPrice('BTC',true),
            xcp_info = getAssetPrice('XCP',true);
        // Handle Updating asset balances (first 500 only)
        $.getJSON(FW.XCHAIN_API + '/api/balances/' + addr, function( data ){
            data.data.forEach(function(item){ info.data.push(item); });
            xcp = true; // Flag to indicate we are done with XCP update
            doneCb(info);
        });
        // Callback to handle adding BTC to balances list
        var addBTCCb = function(qty){
            info.data.push({
                asset: "BTC",
                estimated_value: {
                    btc: qty,
                    usd: numeral(parseFloat(btc_info.price_usd) * qty).format('0.00'),
                    xcp: numeral(qty / parseFloat(xcp_info.price_btc)).format('0.00000000'),
                },
                quantity: qty
            });
            btc = true; // Flag to indicate we are done with BTC update
            doneCb(info);
        }
        // Handle updating BTC balance via blocktrail
        var qty = '0.00000000';
        $.getJSON('https://api.blocktrail.com/v1/' + net + '/address/' + addr + '?api_key=' + FW.API_KEYS.BLOCKTRAIL, function( data ){
            if(data.balance)
                qty =  numeral(data.balance * 0.00000001).format('0.00000000');
            addBTCCb(qty);
        }).fail(function(o){
            // Failover to requesting balance info from chain.so
            $.getJSON('https://chain.so//api/v2/get_address_balance/' + net2 + '/' + addr, function( data ){
                if(data.status=='success')
                    qty = numeral(parseFloat(data.data.confirmed_balance) + parseFloat(data.data.unconfirmed_balance)).format('0.00000000');
                addBTCCb(qty);
            });
        });
    }
}


// Update address history information
function updateWalletHistory( address, force ){
    // console.log('updateWalletHistory address, force=',address, force);
    var addr  = (address) ? address : FW.WALLET_ADDRESS,
        net   = (FW.WALLET_NETWORK==2) ? 'tbtc' : 'btc',
        info  = getAddressHistory(addr) || {},
        last  = info.lastUpdated || 0,
        ms    = 300000; // 5 minutes
    var status = {
        btc: false,    // Flag to indicate if BTC update is done
        xcp: false,    // Flag to indicate if XCP update is done
        mempool: false // Flag to indicate if mempool update is done
    }
    // Handle updating BTC and XCP transaction history
    if((parseInt(last) + ms)  <= Date.now() || force){
        // console.log('updating wallet history');
        // Callback to handle saving data when we are entirely done 
        var doneCb = function(){
            var done = (status.btc && status.xcp && status.mempool) ? true : false;
            // Handle sorting/saving the history information
            if(done){
                // Sort the history by timestamp, newest first
                info.data.sort(function(a,b){
                    if(a.timestamp < b.timestamp)
                        return 1;
                    if(a.timestamp > b.timestamp)
                        return -1;
                    return 0;
                });
                var arr = [info];
                FW.WALLET_HISTORY.forEach(function(item){
                    if(item.address!=addr)
                        arr.push(item);
                });
                FW.WALLET_HISTORY = arr;
                ls.setItem('walletHistory',JSON.stringify(FW.WALLET_HISTORY));
                updateHistoryList();
            }
        }
        // Define default record
        var info = {
            address: addr,
            data: [],
            lastUpdated: Date.now()
        }
        // Function to handle adding/updating transaction history records
        var addTransaction = function(data){
            // console.log('addTransaction data=',data);
            var record = {},
                arr    = [];
            info.data.forEach(function(item, idx){
                if(item.tx==data.tx)
                    record = item;
                else 
                    arr.push(item);
            });
            // Bail out if this is already a known BTC transaction
            if(data.asset=='BTC' && typeof record.tx!== 'undefined')
                return;
            // Add the data to the array and save arr to info.data
            arr.push(data);
            info.data = arr;
        }
        // Handle updating BTC history
        $.getJSON( 'https://api.blocktrail.com/v1/' + net + '/address/' + addr + '/transactions?limit=100&sort_dir=desc&api_key=' + FW.API_KEYS.BLOCKTRAIL, function( data ){
            data.data.forEach(function(item){
                var quantity = numeral(item.estimated_value * 0.00000001).format('0.00000000');
                if(item.inputs[0].address==addr)
                    quantity = '-' + quantity;
                addTransaction({
                    type: 'send',
                    tx: item.hash,
                    asset: 'BTC',
                    asset_longname: '', 
                    quantity: quantity,
                    timestamp: (item.block_height) ? moment(item.time,["YYYY-MM-DDTH:m:s"]).unix() : null
                });
            });
            status.btc = true; // Flag to indicate we are done with BTC update
            doneCb();
        });
        // Handle updating XCP Transactions
        $.each(['/api/history/', '/api/mempool/'], function(idx, endpoint){
            $.getJSON(FW.XCHAIN_API + endpoint + addr, function( data ){
                data.data.forEach(function(item){
                    var quantity = item.quantity,
                        tstamp   = item.timestamp,
                        asset    = item.asset,
                        tx_type  = String(item.tx_type).toLowerCase();
                    if(tx_type=='bet'){
                        asset    = 'XCP';
                        quantity = item.wager_quantity;
                    } else if(tx_type=='burn'){
                        asset    = 'BTC';
                        quantity = item.burned;
                    } else if(tx_type=='order'){
                        asset    = item.get_asset,
                        quantity = item.get_quantity;
                    } else if(tx_type=='send'){
                        if(item.source==address)
                            quantity = '-' + quantity;
                    }                    
                    addTransaction({
                        type: tx_type,
                        tx: item.tx_hash,
                        asset: asset,
                        asset_longname: item.asset_longname, 
                        quantity: quantity,
                        timestamp: tstamp
                    });
                });
                if(idx==0)
                    status.xcp = true;     // Flag to indicate we are done with XCP update
                if(idx==1)
                    status.mempool = true; // Flag to indicate we are done with mempool update
                doneCb();
            });
        });
    }
}

// Handle checking balances info for a given address 
// Optionally you can specify an asset to get back just that balance
function getAddressBalance(address, asset=''){
    var info = false;
    FW.WALLET_BALANCES.forEach(function(item){
        if(item.address==address){
            if(asset==''){
                info = item
            } else {
                item.data.forEach(function(itm){
                    if(itm.asset==asset||itm.asset_longname==asset)
                        info = itm;
                });
            }
        }
    });
    return info;
}

// Handle checking balances info for a given address 
// Optionally you can specify an asset to get back just that balance
function getAddressHistory(address, asset=''){
    var info = false;
    FW.WALLET_HISTORY.forEach(function(item){
        if(item.address==address){
            if(asset==''){
                info = item
            } else {
                item.data.forEach(function(itm){
                    if(itm.asset==asset||itm.asset_longname==asset)
                        info = itm;
                });
            }
        }
    });
    return info;
}

// Handle updating basic wallet information via a call to xchain.io/api/network
function updateNetworkInfo( force ){
    var last = ls.getItem('networkInfoLastUpdated') || 0,
        ms   = 300000; // 5 minutes
    if((parseInt(last) + ms)  <= Date.now() || force ){
        // BTC/USD Price
        $.getJSON( FW.XCHAIN_API + '/api/network', function( data ){
            if(data){
                FW.NETWORK_INFO = data;
                ls.setItem('networkInfo',JSON.stringify(data));
                ls.setItem('networkInfoLastUpdated', Date.now());
                updateWalletOptions();
            }
        });
    }
}

// Display error message and run callback (if any)
function cbError(msg, callback){
    dialogMessage(null, msg, true);
    if(typeof callback === 'function')
        callback();
}

// Convert an amount to satoshis
function getSatoshis(amount){
    var num = numeral(amount);
    if(/\./.test(amount))
        num.multiply(100000000);
    return parseInt(num.format('0'));
}

// Get private key for a given network and address
function getPrivateKey(network, address){
    var wallet = getWallet(),
        net    = (network=='testnet') ? 'testnet' : 'livenet',
        priv   = false;
    // Check any we have a match in imported addresses
    if(FW.WALLET_KEYS[address])
        priv = FW.WALLET_KEYS[address];
    // Loop through HD addresses trying to find private key
    if(!priv){
        var key = bitcore.HDPrivateKey.fromSeed(wallet, bitcore.Networks[net]),
            idx = false;
        FW.WALLET_ADDRESSES.forEach(function(item){
            if(item.address==address)
                idx = item.index;
        });
        // If we found the address index, use it to generate private key
        if(idx !== false){
            var d = key.derive("m/0'/0/" + idx),
                a = bitcore.Address(d.publicKey, bitcore.Networks[net]).toString();
            if(a==address)
                priv = d.privateKey.toWIF();
        } 
    }
    return priv;
}

// Handle updating the balances list
function updateBalancesList(){
    var html    = '',
        cnt     = 0,
        active  = 'BTC', // default to BTC being active
        addr    = FW.WALLET_ADDRESS,
        search  = $('.balances-list-search'),
        filter  = search.val(),
        info    = getAddressBalance(addr),
        btc     = getAddressBalance(addr, 'BTC'),
        xcp     = getAddressBalance(addr, 'XCP'),
        btc_amt = (btc) ? btc.quantity : 0,
        xcp_amt = (xcp) ? xcp.quantity : 0,
        btc_val = (btc) ? btc.estimated_value.usd : 0,
        xcp_val = (xcp) ? xcp.estimated_value.usd : 0,
        fmt     = '0,0.00000000',
        fmt_usd = '0,0.00',
        display = [];
    if(info && info.data.length){
        // Always display BTC balance
        display.push({ 
            asset: 'BTC', 
            icon: 'BTC', 
            quantity: numeral(btc_amt).format(fmt), 
            value: numeral(btc_val).format(fmt_usd), 
            cls: 'active' 
        });
        // Display XCP balance if we have one
        if(xcp_amt)
            display.push({ 
                asset: 'XCP', 
                icon: 'XCP', 
                quantity: numeral(xcp_amt).format(fmt), 
                value: numeral(xcp_val).format(fmt_usd), 
                cls: '' 
            });
        // Loop through balances and add
        info.data.forEach(function(item){
            if(item.asset.length>=4){
                var asset = (item.asset_longname!='') ? item.asset_longname : item.asset,
                    fmt   = (item.quantity.indexOf('.')!=-1) ? '0,0.00000000' : '0,0';
                display.push({ 
                    asset: asset, 
                    icon: item.asset, 
                    quantity: numeral(item.quantity).format(fmt), 
                    value: numeral(item.estimated_value.usd).format(fmt_usd), 
                    cls: '' 
                });
            }
        });
        display.forEach(function(item){
            var show = (filter!='') ? false : true;
            if(filter!='')
                show = (item.asset.search(new RegExp(filter, "i")) != -1) ? true : false;
            if(show){
                if(cnt % 2)
                    item.cls += ' striped'
                cnt++;
                html += getBalanceHtml(item);
            }
        });
    }
    // Update balances list with completed html
    $('.balances-list-assets ul').html(html);
    // Handle updating the 'active' item in the balances list
    // We need to do this every time we update the balances list content
    $('.balances-list ul li').click($.debounce(100,function(e){
        $('.balances-list ul li').removeClass('active');
        $(this).addClass('active');
        var asset = $(this).find('.balances-list-asset').text();
        loadAssetInfo(asset);
    }));
}

// Handle returning html for a asset balance item
function getBalanceHtml(data){
    var value = (data.value!='0.00') ? '$' + data.value : '';
    var html =  '<li class="balances-list-item ' + data.cls + '" data-asset="' + data.asset+ '">' +
                '    <div class="balances-list-icon">' +
                '        <img src="' + FW.XCHAIN_API + '/icon/' + data.icon + '.png" >' +
                '    </div>' +
                '    <div class="balances-list-info">' +
                '        <table width="100%">' +
                '        <tr>' +
                '            <td class="balances-list-asset" colspan="2">' + data.asset + '</div>' +
                '        <tr>' +
                '            <td class="balances-list-amount">' + data.quantity + '</td>' +
                '            <td class="balances-list-price">' + value + '</td>' +
                '        </tr>' +
                '        </table>' +
                '    </div>' +
                '</li>';
    return html;
}

// Handle updating the history list
function updateHistoryList(){
    var html    = '',
        cnt     = 0,
        active  = 'BTC', // default to BTC being active
        addr    = FW.WALLET_ADDRESS,
        search  = $('.history-list-search'),
        filter  = search.val(),
        info    = getAddressHistory(addr),
        display = [];
    if(info && info.data.length){
        // Loop through history and add to display list
        info.data.forEach(function(item){
            var asset = (item.asset_longname!='') ? item.asset_longname : item.asset,
                fmt   = (item.quantity && String(item.quantity).indexOf('.')!=-1) ? '0,0.00000000' : '0,0';
            display.push({ 
                type: item.type,
                tx: item.tx,
                asset: asset, 
                icon: item.asset, 
                quantity: numeral(item.quantity).format(fmt), 
                timestamp: item.timestamp,
                // value: numeral(item.estimated_value.usd).format(fmt_usd), 
                cls: '' 
            });
        });
        display.forEach(function(item){
            var show = (filter!='') ? false : true;
            if(filter!=''){
                var re = new RegExp(filter, "i");
                if(String(item.asset).search(re)!=-1||String(item.tx).search(re)!=-1)
                    show = true;
            }
            if(show){
                if(cnt % 2)
                    item.cls += ' striped'
                cnt++;
                html += getHistoryHtml(item);
            }
        });
    }
    // Update balances list with completed html
    $('.history-list-transactions ul').html(html);
    // Handle updating the 'active' item in the balances list
    // We need to do this every time we update the balances list content
    $('.history-list-transactions ul li').click($.debounce(100,function(e){
        $('.history-list-transactions ul li').removeClass('active');
        $(this).addClass('active');
        var txhash = $(this).attr('txhash'),
            txtype = $(this).attr('txtype'),
            asset  = $(this).attr('asset');
        loadTransactionInfo({
            tx: txhash, 
            type: txtype, 
            asset: asset
        });
    }));
}

// Handle returning html for a history list / transaction item
function getHistoryHtml(data){
    // Determine the correct icon to display based on type
    var type = data.type,
        src  = 'images/icons/btc.png';
    if(type=='bet'){
        src = 'images/icons/xcp.png';
    } else if(type=='broadcast'){
        src = 'images/icons/broadcast.png';
    } else if(type=='dividend'){
        src = 'images/icons/dividend.png';
    } else if(type=='cancel'){
        src = 'images/icons/cancel.png';
    } else if((type=='send'||type=='order'||type=='issuance') && data.asset!='BTC'){
        src = FW.XCHAIN_API + '/icon/'  + String(data.icon).toUpperCase() + '.png';
    }
    var icon = '<img src="' + src + '"/>';
    // Determine the correct description string to show
    var str  = '',
        amt  = String(data.quantity).replace('-','');
    if(type=='send'){
        str = (/\-/.test(data.quantity)) ? 'Sent ' : 'Received ';
    } else if(type=='bet'){
        str = 'Bet ';
    } else if(type=='broadcast'){
        str = 'Counterparty Broadcast';
    } else if(type=='burn'){
        str = 'Burned ';
    } else if(type=='dividend'){
        str = 'Paid Dividend on ';
    } else if(type=='issuance'){
        str = 'Counterparty Issuance';
    } else if(type=='order'){
        str = 'Order - Buy ';
    } else if(type=='cancel'){
        str = 'Cancel Order ';
    }
    if(type=='send'||type=='bet'||type=='burn'||type=='order')
        str += amt;
    var amount = str;
    // Determine correct class to use
    var cls  = data.cls;
    if(type=='send')
        cls += (/\-/.test(data.quantity)) ? ' history-list-sent' : ' history-list-received';
    if(type=='bet'||type=='burn')
        cls += ' history-list-sent';
    // Determine correct asset name to display (if any)
    var asset = (data.asset) ? data.asset : '';
    var html =  '<li class="history-list-item ' + cls + '" txhash="' + data.tx + '" txtype="' + type + '" + asset="' + asset + '">' +
                '    <div class="history-list-icon">' + icon + '</div>' +
                '    <div class="history-list-info">' +
                '        <table width="100%">' +
                '        <tr>' +
                '           <td>' +
                '                <div class="history-list-amount">' + amount + '</div>' +
                '                <div class="history-list-asset">' + asset + '</div>' +
                '                <div class="history-list-timestamp"><span data-livestamp='  + data.timestamp + ' class="nowrap"></span></div>' +
                '           </td>' +
                '        </tr>' +
                '        </table>' +
                '    </div>' +
                '</li>';
    return html;
}

// Handle resetting the asset information to a fresh/new state
function resetAssetInfo(asset){
    $('#asset-name').text(' ');
    $('#asset-value-btc').text(' ');
    $('#asset-value-xcp').text(' ');
    $('#asset-value-usd').text(' ');    
    $('#asset-total-supply').text(' ');
    $('#asset-marketcap').text(' ');
    $('#asset-last-price').text(' ')
    $('#rating_current').text('NA');
    $('#rating_30day').text('NA');
    $('#rating_6month').text('NA');
    $('#rating_1year').text('NA');
    $('#asset-info-enhanced').hide();
}

// Handle loading asset information 
// Be VERY VERY careful about how you use any data from an untrusted source!
// use .text() instead of .html() when updating DOM with untrusted data
function loadAssetInfo(asset){
    var asset    = String(asset).trim(),
        balance  = getAddressBalance(FW.WALLET_ADDRESS, asset),
        icon     = (balance && balance.asset) ? balance.asset : asset,
        feedback = $('#asset-reputation-feedback');
    if(balance){
        // Reset the asset info so we start fresh (prevent old info showing if we get failures)
        resetAssetInfo();
        // Name & Icon
        $('#asset-name').text(asset);
        $('#asset-icon').attr('src', FW.XCHAIN_API + '/icon/' + icon + '.png');
        $('#asset-info-more').attr('href', FW.XCHAIN_API + '/asset/' + asset);
        // Estimated Value
        var val = balance.estimated_value;
        $('#asset-value-btc').text(numeral(val.btc).format('0,0.00000000'));
        $('#asset-value-xcp').text(numeral(val.xcp).format('0,0.00000000'));
        $('#asset-value-usd').text('$' + numeral(val.usd).format('0,0.00'));
        var bal = balance.quantity,
            fmt = (balance.quantity.indexOf('.')==-1) ? '0,0' : '0,0.00000000';
        $('#asset-current-balance').text(numeral(bal).format(fmt));
        // Callback function to process asset information
        var cb = function(o){
            // console.log('o=',o);
            if(!o.error){
                var fmt = (String(o.supply).indexOf('.')==-1) ? '0,0' : '0,0.00000000';
                $('#asset-total-supply').text(numeral(o.supply).format(fmt));
                // console.log('xcp,supply,usd',o.estimated_value.xcp, o.supply, xcp_usd);
                var xcp_usd = getAssetPrice('XCP'),
                    mcap    = numeral((o.estimated_value.xcp * o.supply) * xcp_usd).format('0,0.00'),
                    last    = numeral(o.estimated_value.xcp).format('0,0.00000000'),
                    lock    = $('#asset-locked-status');
                $('#asset-marketcap').text('$' + mcap);
                $('#asset-last-price').text(last);
                $('#asset-description').text(o.description);
                // Force locked on certain items
                if(['BTC','XCP'].indexOf(asset)!=-1)
                    o.locked = true;
                if(o.locked){
                    lock.removeClass('fa-unlock').addClass('fa-lock');
                } else {
                    lock.removeClass('fa-lock').addClass('fa-unlock');
                }
                // Only allow feedback on XCP and assets, not BTC
                if(asset=='BTC'){
                    feedback.hide();
                } else {
                    feedback.attr('href','https://reputation.coindaddy.io/xcp/asset/' + asset);
                    feedback.show();
                }
                // Display the description info if we have it
                var desc = String(o.description).toString(), // Make sure description is a string
                    re1  = /^(.*).json$/,
                    re2  = /^http:\/\//,
                    re3  = /^https:\/\//;   
                if(o.description!=''){
                    $('#asset-info-not-available').hide();
                    $('#asset-info').show();
                }
                $('#asset-description').text(o.description);
                // If the file starts with http and does NOT end with JSON, then assume it is valid url and link it
                if(!re1.test(desc) && (re2.test(desc)||re3.test(desc))){
                    // create element to ensure we are only injecting a link with text for description/name
                    var el = $('<a></a>').text(desc);
                    el.attr('target','_blank');
                    el.attr('href', desc);
                    $('#asset-description').html(el);
                }
                // Handle loading enhanced asset info
                if(re1.test(desc)){
                    loadExtendedInfo();
                } else if(asset=='BTC'){
                    loadExtendedInfo({
                        name: 'Bitcoin (BTC)',
                        description: 'Bitcoin is digital money',
                        website: 'https://bitcoin.org'
                    });
                } else if(asset=='XCP'){
                    loadExtendedInfo({
                        name: 'Counterparty (XCP)',
                        description: 'Counterparty is a free and open platform that puts powerful financial tools in the hands of everyone with an Internet connection. Counterparty creates a robust and secure marketplace directly on the Bitcoin blockchain, extending Bitcoin\'s functionality into a full fledged peer-to-peer financial platform.',
                        website: 'https://counterparty.io'
                    });
                } else {
                    if(o.description==''){
                        $('#asset-info-not-available').show();
                        $('#asset-info').hide();
                    }
                }
            }
        }
        // Callback function to process reputation information
        var cb2 = function(o){
            if(!o.error){
                var arr = ['current','30day','6month','1year'];
                arr.forEach(function(name){
                    var rating = o['rating_' + name],
                        text   = (rating>0) ? rating : 'NA';
                    $('#rating_' + name).html('<a href="https://reputation.coindaddy.io/xcp/asset/' + asset + '" target="_blank"><div class="rateit" data-rateit-readonly="true" data-rateit-value="' + rating + '" data-rateit-ispreset="true"></div></a> <span class="rateit-score">' + text + '</span>')
                });
                $('.rateit').rateit();
            }
        }
        // Hardcode the BTC values.. otherwise request the asset details
        if(asset=='BTC'){
            var btc = getAssetPrice('BTC',true),
                xcp = getAssetPrice('XCP',true);
            cb({
                asset: 'BTC',
                description: "Bitcoin is digital money",
                estimated_value: {
                    btc: 1,
                    usd: btc.market_cap_usd,
                    xcp: 1/xcp.price_btc
                },
                supply: btc.total_supply
            });
            cb2({
                asset: "BTC",
                verify_status: "Not Verified",
                rating_current: "5.00",
                rating_30day: "5.00",
                rating_6month: "5.00",
                rating_1year: "5.00"
            });
        } else {
            getAssetInfo(asset, cb);
            getAssetReputationInfo(asset, cb2);
        }
    }
} 

// Function to handle requesting extended asset info (if any) and updating page with extended info
function loadExtendedInfo(data){
    var desc = $('#asset-description').text(),
        re1  = /^(.*).json$/,
        re2  = /^http:\/\//,
        re3  = /^https:\/\//;
    // If the file starts with http and does NOT end with JSON, then assume it is valid url and link it
    if(!re1.test(desc) && (re2.test(desc)||re3.test(desc)))
        $('#asset-description').html('<a href="' + desc + '" target="_blank">' + desc + '</a>');
    var url   = (re2.test(desc)||re3.test(desc)) ? desc : 'http://' + desc,
        json  = FW.XCHAIN_API + '/relay?url=' + desc;
    $('#asset-description').html('<a href="' + url + '" target="_blank">' + desc + '</a>');
    var cb = function(o){
        // console.log('o=',o);
        if(o && (o.website!=''||o.description!='')){
            $('#asset-info-enhanced').show();
            var name = (o.name && o.name!='') ? o.name : o.asset;
            $('#asset-info-name').text(name);
            // Update Website
            var html = '';
            if(o.website && o.website!='')
                html = '<a href="' + getValidUrl(o.website) + '" target="_blank">' + o.website + '</a>';
            $('#asset-info-website').html(html);
            $('#asset-info-pgpsig').text(o.pgpsig);
            // Run description through sanitizer to remove any XSS or other nasties
            if(o.description && o.description!=''){
                var html = sanitizer.sanitize(o.description);
                $('#asset-description').html(html);
            }
        } else {
            $('#asset-info-enhanced').hide();
        }
    };
    if(data){
        cb(data);
    } else {
        $.getJSON( json, function( o ){ cb(o); });
    }
}

// Handle building out the HTML for the address list
function updateAddressList(){
    var html   = '',
        cnt    = 0,
        addr   = FW.WALLET_ADDRESS,
        list   = $(".address-list ul"),
        search = $('.address-list-search'),
        type   = FW.WALLET_ADDRESS_TYPE;
        filter = search.val();
    FW.WALLET_ADDRESSES.forEach(function(item){
        if(item.network==FW.WALLET_NETWORK){
            var filterMatch = (filter=='') ? true : false,
                typeMatch   = (type==0) ? true : false,
                re          = new RegExp(filter,'i');
            if(filter && (re.test(item.label) || re.test(item.address)))
                filterMatch = true;
            if(type!=0 && item.type==type)
                typeMatch = true;
            // Only display if we have both filter and type matches
            if(filterMatch && typeMatch){
                cnt++;
                var cls = (item.address==addr) ? 'active' : '';
                if(cnt==2){
                    cls += ' striped'
                    cnt = 0;
                }
                var label   = item.label,
                    address = item.address;
                // Highlight the filter/search
                if(filter){
                    label   = label.replace(filter,'<span class="highlight-search-term">' + filter + '</span>');
                    address = address.replace(filter,'<span class="highlight-search-term">' + filter + '</span>');
                }
                var btc = getAddressBalance(address, 'BTC'),
                    xcp = getAddressBalance(address, 'XCP'),
                    btc_amt = (btc) ? btc.quantity : 0,
                    xcp_amt = (xcp) ? xcp.quantity : 0,
                    fmt = '0,0.00000000';
                html += '<li class="' + cls + ' address-list-item" data-address="' + address + '">';
                html += '    <div class="address-list-info">';
                html += '        <div class="address-list-label">' + label + '</div>';
                html += '        <div class="address-list-address">' + address + '</div>';
                html += '        <div class="address-list-amount"><div class="fw-icon-20 fw-icon-btc pull-left margin-right-5"></div> ' + numeral(btc_amt).format(fmt) + '</div>';
                html += '        <div class="address-list-amount"><div class="fw-icon-20 fw-icon-xcp pull-left margin-right-5"></div> ' + numeral(xcp_amt).format(fmt) + '</div>';
                html += '    </div>';
                html += '</li>';
            }
        }
    });
    if(html=='')
        html = '<div class="address-list-empty">No addresses found</div>';
    list.html(html);
    // Handle updating/toggling the 'active' item in the address list
    // We need to do this every time we update the address list content
    $('.address-list ul li').click($.debounce(100,function(e){
        $('.address-list ul li').removeClass('active');
        $(this).addClass('active');
        addr = $(this).find('.address-list-address').text();
        $('.selected-address').val(addr);
    }));
    // Treat double-clicks as if the user clicked the OK button
    $('.address-list ul li').dblclick($.debounce(100,function(e){
        $('.dialog-change-address .btn-ok').click();
    }));
}

// Handle loading asset information 
function loadTransactionInfo(data){
    // data = {
    //     type: 'order',
    //     tx: 'b11c049d86bc8386e42aa82b4f998062f65abb126c08155a3a443f141eabdf08',
    //     asset: ''
    // };
    FW.CURRENT_TRANSACTION = data;
    $('.history-content').load('html/history/' + data.type + '.html');
} 

// Function to handle making a URL a url valid by ensuring it starts with http or https
function getValidUrl( url ){
    var re1 = /^http:\/\//,
        re2 = /^https:\/\//;
    if(!(re1.test(url)||re2.test(url)))
        url = 'http://' + url;
    return url;
}

// Determine form type based on what form is visible
var getFormType = function(){
    var type = '';
    if($('#send-form').length)
        type = 'send';
    else if($('#create-token-form').length)
        type = 'create-token';
    else if($('#change-description-form').length)
        type = 'change-description';
    else if($('#issue-supply-form').length)
        type = 'issue-supply';
    else if($('#lock-supply-form').length)
        type = 'lock-supply';
    else if($('#transfer-ownership-form').length)
        type = 'transfer-ownership';
    else if($('#dividend-form').length)
        type = 'dividend';
    else if($('#sign-message-form').length)
        type = 'sign-message';
    else if($('#sign-transaction-form').length)
        type = 'sign-transaction';
    else if($('#broadcast-message-form').length)
        type = 'broadcast';
    else if($('#callback-form').length)
        type = 'callback';
    else if($('#add-market-form').length)
        type = 'add-market';
    else if($('#create-order-form').length)
        type = 'create-order';
    else if($('#btcpay-form').length)
        type = 'btcpay';
    return type;
}


// Convert array of serialized form values into object with name:value pairs
function array2Object(arr){
    var vals   = {};
    for(var i=0;i<arr.length;i++){
        var o = arr[i];
        vals[o.name] = o.value;
    }
    return vals;
}

/*
 * Counterparty related functions
 */


// Handle generating a send transaction
function cpSend(network, source, destination, memo, currency, amount, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createSend(network, source, destination, memo, currency, getSatoshis(amount), fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast send transaction', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign send transaction',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create send transaction';
            cbError(msg, cb);
        }
    });
}

// Handle creating/signing/broadcasting an 'Issuance' transaction
function cpIssuance(network, source, asset, quantity, divisible, description, destination, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createIssuance(network, source, asset, quantity, divisible, description, destination, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast issuance transaction. Please try again.', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign issuance transaction. Please try again.',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create issuance transaction';
            cbError(msg, cb);
        }
    });
}

// Handle creating/signing/broadcasting an 'Broadcast' transaction
function cpBroadcast(network, source, text, value, feed_fee, timestamp, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createBroadcast(network, source, text, value, feed_fee, timestamp, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast transaction. Please try again.', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign broadcast transaction. Please try again.',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create broadcast transaction';
            cbError(msg, cb);
        }
    });
}

// Handle creating/signing/broadcasting an 'Dividend' transaction
function cpDividend(network, source, asset, dividend_asset, quantity_per_unit, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createDividend(network, source, asset, dividend_asset, quantity_per_unit, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast transaction. Please try again.', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign dividend transaction. Please try again.',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create dividend transaction';
            cbError(msg, cb);
        }
    });
}

// Handle creating/signing/broadcasting an 'Cancel' transaction
function cpCancel(network, source, tx_hash, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createCancel(network, source, tx_hash, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast transaction. Please try again.', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign cancel transaction. Please try again.',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create a cancel transaction';
            cbError(msg, cb);
        }
    });
}

// Handle creating/signing/broadcasting an 'BTCpay' transaction
function cpBtcpay(network, source, order_match_id, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createBtcpay(network, order_match_id, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast transaction. Please try again.', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign btcpay transaction. Please try again.',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create a btcpay transaction';
            cbError(msg, cb);
        }
    });
}


// Handle generating a send transaction
function cpOrder(network, source, get_asset, give_asset, get_quantity, give_quantity, expiration, fee, callback){
    var cb  = (typeof callback === 'function') ? callback : false;
    // Create unsigned send transaction
    createOrder(network, source, get_asset, give_asset, getSatoshis(get_quantity), getSatoshis(give_quantity), expiration, fee, function(o){
        if(o && o.result){
            // Sign the transaction
            signTransaction(network, source, o.result, function(signedTx){
                if(signedTx){
                    // console.log('signed Tx=',signedTx);
                    // Broadcast the transaction
                    broadcastTransaction(network, signedTx, function(txid){
                        if(txid){
                            if(cb)
                                cb(txid);
                        } else {
                            cbError('Error while trying to broadcast order transaction', cb);
                        }
                    });
                } else {
                    cbError('Error while trying to sign order transaction',cb);
                }
            });
        } else {
            var msg = (o.error && o.error.message) ? o.error.message : 'Error while trying to create order transaction';
            cbError(msg, cb);
        }
    });
}


// Handle sending request to counterparty servers
function cpRequest(network, data, callback){
    var net  = (network=='testnet') ? 'testnet' : 'mainnet',
        info = FW.WALLET_SERVER_INFO[net],
        url  = ((info.ssl) ? 'https' : 'http') + '://' + info.host + ':' + info.port + '/api/',
        auth = $.base64.btoa(info.user + ':' + info.pass);
        // console.log('info=',info);
        // console.log('url=',url);
    // Send request to server, process response
    $.ajax({
        type: "POST",
        url: url,
        data: JSON.stringify(data),
        dataType: 'json',
        crossDomain: false,
        headers: {
            'Authorization': 'Basic ' + auth, 
            'Content-Type': 'application/json; charset=UTF-8'
        },
        success: function(data){
            if(typeof callback === 'function')
                callback(data);
        }
    });
}

// Handle creating send transaction
function createSend(network, source, destination, memo, asset, quantity, fee, callback){
    // console.log('createSend=',network, source, destination, asset, quantity, fee, callback);
    var data = {
       method: "create_send",
       params: {
            source: source,
            destination: destination,
            asset: asset,
            quantity: parseInt(quantity),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    if(memo)
        data.params.memo = memo;
    if(fee)
        data.params.fee = fee;
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating issuance transaction
function createIssuance(network, source, asset, quantity, divisible, description, destination, fee, callback){
    // console.log('createIssuance=', network, source, asset, quantity, divisible, description, destination, fee, callback);
    var data = {
       method: "create_issuance",
       params: {
            source: source,
            asset: asset,
            quantity: parseInt(quantity),
            divisible: (divisible) ? 1 : 0,
            description:  (description) ? description : null,
            transfer_destination: (destination) ? destination : null,
            fee: parseInt(fee),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating broadcast transaction
function createBroadcast(network, source, text, value, feed_fee, timestamp, fee, callback){
    // console.log('createBroadcast=', network, source, text, value, feed_fee, timestamp, fee, callback);
    var data = {
       method: "create_broadcast",
       params: {
            source: source,
            text: text,
            value: value,
            fee_fraction: feed_fee,
            timestamp: timestamp,
            fee: parseInt(fee),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating dividend transaction
function createDividend(network, source, asset, dividend_asset, quantity_per_unit, fee, callback){
    // console.log('createDividend=', network, source, asset, dividend_asset, quantity_per_unit, fee, callback);
    var data = {
       method: "create_dividend",
       params: {
            source: source,
            asset: asset,
            dividend_asset: dividend_asset,
            quantity_per_unit: quantity_per_unit,
            fee: parseInt(fee),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating cancel transaction
function createCancel(network, source, tx_hash, fee, callback){
    // console.log('createCancel=', network, source, tx_hash, fee, callback);
    var data = {
       method: "create_cancel",
       params: {
            source: source,
            offer_hash: tx_hash,
            fee: parseInt(fee),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating order transaction
function createOrder(network, source, get_asset, give_asset, get_quantity, give_quantity, expiration, fee, callback){
    // console.log('createOrder=', network, source, get_asset, give_asset, get_quantity, give_quantity, expiration, fee, callback);
    var data = {
       method: "create_order",
       params: {
            source: source,
            get_asset: get_asset,
            get_quantity: get_quantity,
            give_asset: give_asset,
            give_quantity: give_quantity,
            expiration: expiration,
            fee: parseInt(fee),
            // Temp fix for bug in API (https://github.com/CounterpartyXCP/counterparty-lib/issues/1025)
            fee_required: 0,
            fee_provided: 0,
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}

// Handle creating btcpay transaction
function createBtcpay(network, order_match_id, fee, callback){
    // console.log('createBtcpay=', network, order_match_id, fee, callback);
    var data = {
       method: "create_btcpay",
       params: {
            order_match_id: order_match_id,
            fee: parseInt(fee),
            allow_unconfirmed_inputs: true
        },
        jsonrpc: "2.0",
        id: 0
    };
    cpRequest(network, data, function(o){
        if(typeof callback === 'function')
            callback(o);
    });
}


// Handle signing a transaction
function signTransaction(network, source, unsignedTx, callback){
    var net      = (network=='testnet') ? 'testnet' : 'mainnet',
        callback = (typeof callback === 'function') ? callback : false;
        privKey  = getPrivateKey(net, source)
        cwKey    = new CWPrivateKey(privKey);
    // update network (used in CWBitcore)
    NETWORK = bitcore.Networks[net];
    // Callback to processes response from signRawTransaction()
    var cb = function(x, signedTx){
        if(callback)
            callback(signedTx);
    }
    CWBitcore.signRawTransaction(unsignedTx, cwKey, cb);
}

// Handle signing a message and returning the signature
function signMessage(network, source, message){
    var bc  = bitcore,
        net = (network=='testnet') ? 'testnet' : 'mainnet',
        key = bc.PrivateKey.fromWIF(getPrivateKey(net, source)),
        sig = bc.Message(message).sign(key);
    return sig;
}

// Broadcast a given transaction
function broadcastTransaction(network, tx, callback){
    var net  = (network=='testnet') ? 'BTCTEST' : 'BTC';
    // First try to broadcast using the XChain API
    $.ajax({
        type: "POST",
        url: FW.XCHAIN_API +  '/api/send_tx',
        data: { 
            tx_hex: tx 
        },
        complete: function(o){
            // console.log('o=',o);
            // Handle successfull broadcast
            if(o.responseJSON.tx_hash){
                var txid = o.responseJSON.tx_hash;
                if(callback)
                    callback(txid);
                if(txid)
                    console.log('Broadcasted transaction hash=',txid);
            } else {
                // If the request to XChain API failed, fallback to chain.so API
                $.ajax({
                    type: "POST",
                    url: 'https://chain.so/api/v2/send_tx/' + net,
                    data: { 
                        tx_hex: tx 
                    },
                    dataType: 'json',
                    complete: function(o){
                        // console.log('o=',o);
                        if(o.responseJSON.data && o.responseJSON.data.txid){
                            var txid = o.responseJSON.data.txid;
                            if(callback)
                                callback(txid);
                            if(txid)
                                console.log('Broadcast transaction tx_hash=',txid);
                        } else {
                            cbError('Error while trying to broadcast signed transaction',callback);
                        }
                    }
                });                
            }
        }
    });
}

/* 
 * Dialog boxes 
 * https://nakupanda.github.io/bootstrap3-dialog/
 */

// Generic dialog box to handle simple messages
function dialogMessage( title, message, error, closable, callback ){
    var title = (error) ? '<i class="fa fa-lg fa-fw fa-exclamation-circle"></i> Error' : title; 
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-message',
        title: title,
        message: message,
        closable: (closable==false) ? false : true,
        buttons:[{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success',
            hotkey: 13,
            action: function(msg){
                msg.close();
                if(typeof callback === 'function')
                    callback();
            }
        }]                        
    });
}

// Generic dialog box to handle simple messages
function dialogConfirm( title, message, error, closable, callback, failCb ){
    var title = (error) ? '<i class="fa fa-lg fa-fw fa-exclamation-circle"></i> Error' : title; 
    BootstrapDialog.show({
        type: 'type-default',
        title: title,
        message: message,
        closable: (closable==false) ? false : true,
        buttons:[{
            label: 'No',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger',
            action: function(msg){
                msg.close();
                if(failCb==true && typeof callback === 'function')
                    callback(false); // indicate failure
            }
        },{
            label: 'Yes',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success',
            hotkey: 13,
            action: function(msg){
                msg.close();
                if(typeof callback === 'function')
                    callback(true); // indicate success
            }
        }]                        
    });
}

// Function to handle closing dialog boxes by id
function dialogClose(id){
    $.each(BootstrapDialog.dialogs, function(dialog_id, dialog){
        if(dialog_id==id||typeof id === 'undefined')
            dialog.close();
    });
}

// 'Coming Soon' dialog box0
function dialogComingSoon(){
    dialogMessage('Coming Soon', 'The feature you are trying to access will be coming soon.', false);
}

// 'About Wallet' dialog box
function dialogAbout(){
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-info-circle"></i> About FreeWallet',
        id: 'dialog-about',
        message: $('<div></div>').load('html/about.html')
    });
}

// 'View Address' dialog box
function dialogViewAddress(address){
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'btc-wallet-address',
        title: '<i class="fa fa-lg fa-fw fa-qrcode"></i> View Address',
        message: function(dialog){
            var msg = $('<div class="text-center"></div>');
            addr = (address) ? address : getWalletAddress();
            msg.qrcode({ text: addr });
            msg.append('<div style="margin-top:10px" class="btc-wallet-blackbox">' + addr + '</div>');
            return msg;
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                dialog.close();
            }
        }]
    });
}

// 'Remove Wallet Address' dialog box
function dialogRemoveWalletAddress(address){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('remove an address'))
        return;
    dialogConfirm( 'Are you Sure?', 'Remove address ' + address + ' from your wallet?', false, true, function(){ 
        removeWalletAddress(address);
        updateAddressList();
    });
}

// View Private key for current address
function dialogViewPrivateKey(address){
    // Make sure wallet is unlocked before showing send dialog box
    if(!ss.getItem('wallet')){
        dialogMessage('Wallet Locked!', 'You will need to unlock your wallet before you can view the private key', true);
        return;
    }
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-view-privkey',
        title: '<i class="fa fa-lg fa-fw fa-user-secret"></i> Private Key for ' + FW.WALLET_ADDRESS,
        message: function(dialog){
            var msg  = $('<div class=""></div>'),
                net  = (FW.WALLET_NETWORK==2) ? 'testnet' : 'mainnet';
                addr = (address) ? address : FW.WALLET_ADDRESS,
                key  = getPrivateKey(net, addr);
            msg.append('<div style="margin-top:10px" class="btc-wallet-blackbox">' + key + '</div>');
            msg.append('<div class="alert alert-danger fade in center bold">' +
                            '<h3>Write this private key down and keep it safe!</h3>' +
                            '<ul>' +
                                '<li>Please make sure nobody can look over your shoulder or see your screen.</li>' +
                                '<li>If someone gets this private key, they also gain access to any funds.</li>' +
                            '</ul>' +
                        '</div>');
            return msg;
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                dialog.close();
            }
        }]
    });
}

// 'Change Address' dialog box
function dialogChangeAddress(){
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-change-address',
        cssClass: 'dialog-change-address',
        title: '<i class="fa fa-lg fa-fw fa-bitcoin"></i> Change Wallet Address',
        message: $('<div></div>').load('html/addresses.html'),
    });
}

// 'Create/Enter Password' dialog box
function dialogPassword( enable, callback ){
    var title = (enable) ? 'Enter new wallet password' : 'Enter wallet password';
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-lock"></i> ' + title,
        cssClass: 'btc-wallet-password',
        closable: false,
        message: function(dialog){
            var msg = $('<div></div>');
            msg.append('<input name="wallet_password" type="text" class="form-control"  placeholder="Enter Password" autocomplete="off" style="-webkit-text-security: disc;"/>');
            if(enable){
                msg.append('<input name="wallet_confirm_password" type="text" class="form-control"  placeholder="Confirm Password" autocomplete="off" style="margin: 10px 0px; -webkit-text-security: disc" />');
                msg.append('<p class="justify no-bottom-margin">This password will be used to encrypt your wallet to give you an additional layer of protection against unauthorized use.</p>')
            }
            return msg;
        },
        onshown: function(dialog){
            $('[name="wallet_password"]').focus();
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                // Set flag to indicate user has skipped auth, and not prompt again until needed.
                if(!enable)
                    ss.setItem('skipWalletAuth',1)
                dialog.close();
                updateWalletOptions();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                var pass = $('[name="wallet_password"]').val(),
                    err  = false;
                // Validate that password meets minimum requirements (7 chars, 1 number)
                if(pass.length <=6){
                    err = 'Wallet password must be at least 7 characters long';
                } else if(!/\d/.test(pass)){
                    err = 'Wallet password must contain at least 1 number';
                } else if(enable){
                    var confirm = $('[name="wallet_confirm_password"]').val();
                    if(pass!=confirm)
                        err = 'Password and Confirmation password do not match!';
                }
                if(err){
                    dialogMessage(null, err, true);
                } else {
                    // Enable wallet encryption
                    if(enable){
                        encryptWallet(pass);
                        lockWallet();
                        updateWalletOptions();
                        dialog.close();
                        dialogMessage('<i class="fa fa-lg fa-fw fa-lock"></i> Wallet password enabled', 'Your wallet password is now enabled and your wallet is encrypted.');
                    } else {
                        // Validate wallet password
                        if(isValidWalletPassword(pass)){
                            decryptWallet(pass);
                            dialog.close();
                            dialogMessage('<i class="fa fa-lg fa-fw fa-unlock"></i> Wallet unlocked', 'Your wallet is now unlocked and available for use');
                            updateWalletOptions();
                        } else {
                            dialogMessage(null, 'Invalid password', true);
                        }
                    }
                    // If we have a callback, call it
                    if(typeof callback=='function')
                        callback();
                }
            }
        }]
    });    
}

// 'Lock Wallet' dialog box
function dialogLock(){
    lockWallet();
    updateWalletOptions();
    dialogMessage('<i class="fa fa-lg fa-fw fa-lock"></i> Wallet locked', 'Your wallet has been locked and is unavailable for use.');
}

// 'View Passphrase' dialog box
function dialogPassphrase(){
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-view-passphrase',
        title: '<i class="fa fa-lg fa-fw fa-eye"></i> View Wallet Passphrase',
        message: function(dialog){
            var msg = $('<div></div>');
            msg.append('<p>Your twelve-word wallet passphrase is shown in the black box below.</p>');
            msg.append('<div class="btc-wallet-passphrase">' + getWalletPassphrase() + '</div>');
            msg.append('<div class="alert alert-danger fade in center bold">' +
                            '<h3>Write your passphrase down and keep it safe!</h3>' +
                            '<ul>' +
                                '<li>If you lose this passphrase, you will lose access to your wallet <i>forever</i>.</p>' +
                                '<li>If someone gets your passphrase, they gain access to your wallet.</p>' +
                                '<li>We do not store your passphrase and cannot recover it if lost.</p>' +
                            '</ul>' +
                        '</div>');
            return msg;
        },
        buttons:[{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                dialog.close();
            }
        }]
    });
}

// 'Enter Passphrase' dialog box
function dialogManualPassphrase(){
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-keyboard-o"></i> Enter Passphrase',
        message: function(dialog){
            var msg = $('<div class="center"></div>');
            msg.append('<p>Please enter your existing 12-word wallet passphrase and click \'Ok\'</p>');
            msg.append('<input type="text" class="btc-wallet-passphrase" id="manualPassphrase" autocomplete="off" >');
            return msg;
        },
        onshown: function(dialog){
            $('#manualPassphrase').focus();
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialogWelcome();
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                var val = $('#manualPassphrase').val(),
                    arr = val.split(' '),
                    err = false;
                if(arr.length<12){
                    err='Passphrase must be 12 words in length';
                } else if(!isValidWalletPassphrase(val)){
                    err='Invalid Passphrase';
                }
                if(err){
                    dialogMessage(null, err, true);
                } else {
                    resetWallet();
                    createWallet(val);
                    dialog.close();
                    dialogMessage('<i class="fa fa-lg fa-fw fa-info-circle"></i> Wallet Updated!', 'Your wallet has been updated to use the passphrase you just entered.', false, false);
                }
            }
        }]
    });
}

// 'New Wallet Passphrase' dialog box
function dialogNewPassphrase(){
    var pass = new Mnemonic(128).toWords().toString().replace(/,/gi, " ");
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-new-passphrase',
        title: '<i class="fa fa-lg fa-fw fa-eye"></i> New Wallet Passphrase',
        closable: false,
        message: function(dialog){
            var msg = $('<div></div>');
            msg.append('<p>A passphrase has been created for you and is visible in the black box below. <br/>This passphrase lets you access your wallet and the funds it contains.</p>');
            msg.append('<div class="btc-wallet-passphrase">' + pass + '</div>');
            msg.append('<div class="alert alert-danger fade in center bold">' +
                            '<h3>Write your passphrase down and keep it safe!</h3>' +
                            '<ul>' +
                                '<li>If you lose this passphrase, you will lose access to your wallet <i>forever</i>.</p>' +
                                '<li>If someone gets your passphrase, they gain access to your wallet.</p>' +
                                '<li>We do not store your passphrase and cannot recover it if lost.</p>' +
                            '</ul>' +
                        '</div>');
            msg.append('<div class="checkbox" id="dialog-new-passphrase-confirm"><label><input type="checkbox" id="dialog-new-passphrase-checkbox"> I have <u>written down</u> or otherwise <u>securely stored</u> my passphrase.</label></div>');
            return msg;
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialogWelcome();
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                if($('#dialog-new-passphrase-checkbox').is(':checked')){
                    createWallet(pass)
                    dialog.close();
                } else {
                    $('#dialog-new-passphrase-confirm').effect( "shake", { times: 3, direction: 'up' }, 1000);
                }
            }
        }]
    });
}

// 'Import Private Key' dialog box
function dialogImportPrivateKey(){
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-upload"></i> Import Private Key',
        message: function(dialog){
            var msg = $('<div class="center"></div>');
            msg.append('<p>Please enter your unencrypted private key and click \'Ok\'</p>');
            msg.append('<input type="text" class="btc-wallet-blackbox" id="importPrivateKey">');
            return msg;
        },
        onshown: function(dialog){
            $('#importPrivateKey').focus();
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                var val  = $('#importPrivateKey').val();
                    addr = addWalletPrivkey(val);
                if(addr){
                    dialogMessage('<i class="fa fa-lg fa-fw fa-info-circle"></i> Private Key Imported', 'Address ' + addr + ' has been added to your wallet.');
                    dialog.close();
                    updateAddressList();
                } else {
                    dialogMessage('<i class="fa fa-lg fa-fw fa-info-circle"></i> Error', 'Unable to import the private key you have provided!');
                }
            }
        }]
    });
}

// 'Import Watch-Only' dialog box
function dialogImportWatchAddress(){
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-eye"></i> Add Watch-Only Address',
        message: function(dialog){
            var msg = $('<div class="center"></div>');
            msg.append('<p>Please enter the address you would like to add and click \'Ok\'</p>');
            msg.append('<input type="text" class="btc-wallet-blackbox" id="importWatchOnlyAddress">');
            return msg;
        },
        onshown: function(dialog){
            $('#importWatchOnlyAddress').focus();
        },
        buttons:[{
            label: 'Cancel',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialog.close();
            }
        },{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                var address = $('#importWatchOnlyAddress').val(),
                    network = 'mainnet',
                    valid   = false;
                // Check if the address is valid on mainnet
                NETWORK  = bitcore.Networks[network];
                if(CWBitcore.isValidAddress(address))
                    valid = true;
                // Check if address is valid on testnet
                if(!valid){
                    network = 'testnet';
                    NETWORK = bitcore.Networks[network];
                    if(CWBitcore.isValidAddress(address))
                        valid = true;
                }
                if(valid){
                    var cnt   = 0,
                        found = false;
                    FW.WALLET_ADDRESSES.forEach(function(item){
                        if(item.address==address)
                            found = true;
                        if(item.type==3)
                            cnt++;
                    });
                    // Only add address if it does not exist in the wallet
                    if(!found){
                        addWalletAddress(network, address, 'Watch-Only Address #' + (cnt + 1), 3, null);
                        // Save wallet addresses info to disk
                        ls.setItem('walletAddresses', JSON.stringify(FW.WALLET_ADDRESSES));
                    }
                    // Display success message to users
                    dialogMessage('<i class="fa fa-lg fa-fw fa-info-circle"></i> Watch-Only Address Added', 'Address ' + address + ' has been added to your wallet.');
                    updateAddressList();
                    dialog.close();
                } else {
                    dialogMessage('<i class="fa fa-lg fa-fw fa-info-circle"></i> Error', 'Invalid Address! Please enter a valid address!');
                }
            }
        }]
    });
}

// Function to handle checking if the wallet is unlocked and displaying an error, and return false if 
function dialogCheckLocked(action, callback){
    if(!ss.getItem('wallet')){
        dialogMessage('Wallet Locked!', 'You will need to unlock your wallet before you can ' + action, true, true, callback);
        return true;
    }
}

// 'Send Funds' dialog box
function dialogSend(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('send funds'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-send',
        cssClass: 'dialog-send-funds',
        title: '<i class="fa fa-fw fa-paper-plane"></i> Send Funds',
        message: $('<div></div>').load('html/send.html'),
    });
}

// 'Create Token' dialog box
function dialogCreateToken(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('create a token'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-create-token',
        title: '<i class="fa fa-fw fa-plus-circle"></i> Create a Token',
        message: $('<div></div>').load('html/issuance/token.html'),
    });
}

// 'Change Description' dialog box
function dialogChangeDescription(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('change a token description'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-change-description',
        title: '<i class="fa fa-fw fa-edit"></i> Change Token Description',
        message: $('<div></div>').load('html/issuance/description.html'),
    });
}

// 'Issue Supply' dialog box
function dialogIssueSupply(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('issue token supply'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-issue-supply',
        title: '<i class="fa fa-fw fa-bank"></i> Issue Supply',
        message: $('<div></div>').load('html/issuance/supply.html'),
    });
}

// 'Transfer Ownership' dialog box
function dialogTransferOwnership(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('transfer ownership of a token'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-transfer-ownership',
        title: '<i class="fa fa-fw fa-exchange"></i> Transfer Ownership',
        message: $('<div></div>').load('html/issuance/transfer.html'),
    });
}

// 'Lock Supply' dialog box
function dialogLockSupply(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('lock the supply of a token'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-lock-supply',
        title: '<i class="fa fa-fw fa-lock"></i> Lock Supply',
        message: $('<div></div>').load('html/issuance/lock.html'),
    });
}

// 'Lock Supply' dialog box
function dialogBroadcastMessage(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('broadcast a message'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-broadcast-message',
        title: '<i class="fa fa-fw fa-bullhorn"></i> Broadcast Message',
        message: $('<div></div>').load('html/broadcast.html'),
    });
}

// 'Create Order' dialog box
function dialogOrder(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('create an order'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-create-order',
        title: '<i class="fa fa-fw fa-exclamation-circle"></i> Confirm ' + '<span class="order-type"></span>' + ' Order?',
        message: $('<div></div>').load('html/order.html'),
    });
}

// 'Sign Message' dialog box
function dialogSignMessage(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('sign a message'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-sign-message',
        title: '<i class="fa fa-fw fa-envelope"></i> Sign Message',
        message: $('<div></div>').load('html/sign-message.html'),
    });
}

// 'Sign Transaction' dialog box
function dialogSignTransaction(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('sign a transaction'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-sign-transaction',
        title: '<i class="fa fa-fw fa-file-text"></i> Sign Transaction',
        message: $('<div></div>').load('html/sign-transaction.html'),
    });
}

// 'BTCpay' dialog box
function dialogBTCpay(closable=true){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('make a payment'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-btcpay',
        closable: closable,
        title: '<i class="fa fa-fw fa-bitcoin"></i> Confirm BTCpay?',
        message: $('<div></div>').load('html/btcpay.html')
    });
}


// 'Pay Distribution / Dividend' dialog box
function dialogPayDividend(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('pay dividends'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-pay-dividend',
        title: '<i class="fa fa-fw fa-sitemap"></i> Pay Dividends',
        message: $('<div></div>').load('html/dividend.html')
    });
}

// 'Cancel Order' dialog box
function dialogCancelOrder(){
    // Make sure wallet is unlocked
    if(dialogCheckLocked('cancel an order'))
        return;
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-cancel-order',
        title: '<i class="fa fa-fw fa-ban"></i> Confirm Cancel Order?',
        message: $('<div></div>').load('html/cancel-order.html')
    });
}


// Confirm with user that they want to perform a callback to a remote server
function dialogConfirmCallback(data){
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-confirm-callback',
        title: '<i class="fa fa-fw fa-question-circle"></i> Send data to remote server?',
        message: $('<div></div>').load('html/callback.html')
    }); 
}

// 'Confirm Send' dialog box
function dialogLogout(){
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-logout',
        title: '<i class="fa fa-lg fa-fw fa-power-off"></i> Logout?',
        message: function(dialog){
            var msg = $('<div class="center"></div>');
            msg.append('<p>Are you sure you want to logout of Freewallet?</p>');
            msg.append('<p>This action will remove all of your wallet information from this device.');
            msg.append('<p><div class="alert alert-danger fade in center bold">Please make sure your 12-word passphrase is written down before you logout!</p>');
            msg.append('<div class="checkbox" id="dialog-logout-confirm"><label><input type="checkbox" id="dialog-logout-confirm-checkbox"> I have <u>written down</u> or otherwise <u>securely stored</u> my passphrase before logging out.</label></div>');
            return msg;
        },
        buttons:[{
            label: 'No',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                dialog.close();
            }
        },{
            label: 'Yes',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                if($('#dialog-logout-confirm-checkbox').is(':checked')){
                    resetWallet();
                    dialog.close();
                    dialogMessage('<i class="fa fa-lg fa-fw fa-trash"></i> Logout Complete', 'Your wallet information has been removed. You will now be returned to the setup screen.', false, false, function(){
                        dialogWelcome();
                    });
                } else {
                    $('#dialog-logout-confirm').effect( "shake", { times: 3, direction: 'up' }, 1000);
                }
            }
        }]
    });
}

// 'Enable BTCpay' dialog box
function dialogEnableBtcpay(){
    BootstrapDialog.show({
        type: 'type-default',
        title: '<i class="fa fa-lg fa-fw fa-question-circle"></i> Enable Auto-BTCpay?',
        cssClass: 'btc-wallet-password',
        closable: false,
        message: function(dialog){
            var msg = $('<div></div>');
            // msg.append('<div class="alert alert-info">Please enter your wallet password</div>');
            msg.append('<input name="wallet_password" type="text" class="form-control"  placeholder="Enter Password" autocomplete="off" style="-webkit-text-security: disc;"/>');
            return msg;
        },
        onshown: function(dialog){
            $('[name="wallet_password"]').focus();
        },
        buttons:[{
            label: 'Disable',
            icon: 'fa fa-lg fa-fw fa-thumbs-down',       
            cssClass: 'btn-danger', 
            action: function(dialog){
                // Confirm with user that auto-btcpay will be disabled
                dialogConfirm('Disable Auto-BTCpay?','<div class="alert alert-danger text-center"><b>Notice</b>: Any order matches for BTC will need to be paid manually!</div>', false, false, function(){
                    dialog.close();
                });
            }
        },{
            label: 'Enable',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',       
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                var pass = $('[name="wallet_password"]').val(),
                    err  = false;
                // Validate that password meets minimum requirements (7 chars, 1 number)
                if(pass.length <=6){
                    err = 'Wallet password must be at least 7 characters long';
                } else if(!/\d/.test(pass)){
                    err = 'Wallet password must contain at least 1 number';
                }
                if(err){
                    dialogMessage(null, err, true);
                } else {
                    // Validate wallet password
                    if(isValidWalletPassword(pass)){
                        // Decrypt wallet and save to btcpayWallet
                        decryptWallet(pass);
                        var w = ss.getItem('wallet');
                        if(w)
                            ss.setItem('btcpayWallet',w);
                        ss.removeItem('wallet');
                        ss.removeItem('walletPassword');
                        dialog.close();
                        dialogMessage('<i class="fa fa-lg fa-fw fa-unlock"></i> Auto-BTCpay Enabled', 'Auto-BTCpay is now enabled and any order matches for BTC will be automatically paid');
                    } else {
                        dialogMessage(null, 'Invalid password', true);
                    }
                    // If we have a callback, call it
                    if(typeof callback=='function')
                        callback();
                }
            }
        }]
    });  
}

// 'Add Market' dialog box
function dialogAddMarket(){
    BootstrapDialog.show({
        type: 'type-default',
        id: 'dialog-add-market',
        title: '<i class="fa fa-fw fa-file-text"></i> Add Market',
        message: $('<div></div>').load('html/exchange/add-market.html'),
    });
}

// 'Welcome' dialog box
function dialogWelcome(){
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-welcome',
        closable: false,
        title: '<i class="fa fa-lg fa-fw fa-info-circle"></i> Welcome to FreeWallet',
        message: function(dialog){
            var msg = $('<div class="text-center"></div>');
            msg.append('<img src="images/logo.png" style="width:200px;margin-bottom:20px;">');
            msg.append('<p>FreeWallet is a free wallet for Bitcoin and Counterparty, the world’s first protocol for decentralized financial tools.</p>')
            msg.append( '<div class="row">' +
                            '<div class="col-xs-12 col-sm-6">' +
                                '<h3><i class="fa fa-lock"></i> Secure</h3>'+
                                '<p>All encryption is handled client-side. Neither your passphrase nor any of your private information ever leaves your browser, workstation, or mobile device.</p>' +
                                '<p>FreeWallet passphrases are highly secure, and protect your wallet from any brute force attacks. They are also rather easy to learn and hard to mistype.</p>' +
                            '</div>' +
                            '<div class="col-xs-12 col-sm-6">' +
                                '<h3><i class="fa fa-cloud"></i> Simple</h3>'+
                                '<p>With FreeWallet, your passphrase is literally your wallet, and all of your addresses and keys are generated on-the-fly when you log in.</p>' +
                                '<p>There are no wallet files to backup or secure, and using your passphrase you can access your wallet from any trusted machine with a web browser.</p>' +
                            '</div>' +
                       '</div>');
            return msg;
        },
        buttons:[{
            label: 'Login to Existing Wallet',
            icon: 'fa fa-lg fa-fw fa-keyboard-o pull-left',       
            cssClass: 'btn-info pull-left', 
            action: function(dialog){
                dialogManualPassphrase();
                dialog.close();
            }
        },{
            label: 'Create New Wallet',
            icon: 'fa fa-lg fa-fw fa-plus pull-left',
            cssClass: 'btn-success pull-right', 
            hotkey: 13,
            action: function(dialog){
                dialogNewPassphrase();
                dialog.close();
            }
        }]
    });
}

// 'License Agreement' dialog box
function dialogLicenseAgreement(){
    BootstrapDialog.show({
        type: 'type-default',
        cssClass: 'dialog-license-agreement',
        closable: false,
        title: '<i class="fa fa-lg fa-fw fa-info-circle"></i> License Agreement',
        message: function(dialog){
            var license = '';
            var content = $('<div></div>').load('html/license.html', function(foo){ 
                license = foo;
            });
            var msg = $('<div></div>');
            msg.append('<p>You must read and accept the following agreement in order to use FreeWallet:</p>')
            msg.append( '<div class="well">' +
                            '<h3>1. GRANT OF LICENSE</h3>' +
                            '<p><b>1.1.</b> Subject to the terms and conditions contained within this end user agreement (the “Agreement“), Freewallet.io grants the “User” (or “you”) a non-exclusive, personal, non-transferable right to use the Services on your personal computer or other device that accesses the Internet, namely freewallet.io, FreeWallet Mobile, FreeWallet Desktop, and Counterparty federated nodes (together, the “Services“). By clicking the “I Agree“ button if and where provided and/or using the Service, you consent to the terms and conditions set forth in this Agreement.</p>' +
                            '<p><b>1.2.</b> The Services are not for use by (i) individuals under 18 years of age, (ii) individuals under the legal age of majority in their jurisdiction and (iii) individuals accessing the Services from jurisdictions from which it is illegal to do so. Counterwallet.io and Counterwallet federated nodes are unable to verify the legality of the Services in each jurisdiction and it is the User\'s responsibility to ensure that their use of the Services is lawful. Freewallet.io, FreeWallet Mobile, and FreeWallet Desktop are neither banks nor regulated financial services. Operators do not have access to the Bitcoins stored on the platform, instead Freewallet.io, FreeWallet Mobile, and FreeWallet Desktopsimply provide a means to access Bitcoins, Counterparty (XCP), and other digital assets recorded on the Bitcoin blockchain. Bitcoin private keys are encrypted using the BIP32 Hierarchical Deterministic Wallet algorithm such that Freewallet.io, FreeWallet Mobile, and FreeWallet Desktop cannot access or recover Bitcoins, Counterparty (XCP), or other digital assets in the event of lost or stolen password. </p>' +
                            '<h3>2. NO WARRANTIES.</h3>' +
                            '<p><b>2.1.</b> COUNTERPARTY, FREEWALLET.IO, AND COUNTERPARTY FEDERATED NODES DISCLAIM ANY AND ALL WARRANTIES, EXPRESSED OR IMPLIED, IN CONNECTION WITH THE SERVICES WHICH ARE PROVIDED TO THE USER “AS IS“ AND NO WARRANTY OR REPRESENTATION IS PROVIDED WHATSOEVER REGARDING ITS QUALITY, FITNESS FOR PURPOSE, COMPLETENESS OR ACCURACY.</p>' +
                            '<p><b>2.2.</b> REGARDLESS OF BEST EFFORTS, WE MAKE NO WARRANTY THAT THE SERVICES WILL BE UNINTERRUPTED, TIMELY OR ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.</p>' +
                            '<h3>3. YOUR REPRESENTATIONS AND WARRANTIES</h3>' +
                            '<p>Prior to your use of the Services and on an ongoing basis you represent, warrant, covenant and agree that:</p>' +
                            '<p><b>3.1.</b> your use of the Services is at your sole option, discretion and risk, as neither Freewallet.io, Counterparty federated nodes, nor any individuals affiliated with the Freewallet or Counterparty teams can be held responsible for lost or stolen funds;</p>' +
                            '<p><b>3.2.</b> you are solely responsible for satisfying any and all applicable legal rules and/or obligations, to include the requirements of your local tax authorities, arising from your use of the Services in a given jurisdiction; </p>' +
                            '<p><b>3.3.</b> the telecommunications networks and Internet access services required for you to access and use the Services are entirely beyond the control of the Services and neither Counterparty nor the Services shall bear any liability whatsoever for any outages, slowness, capacity constraints or other deficiencies affecting the same; and</p>' +
                            '<p><b>3.4.</b> you are at least 18 years of age.</p>' +
                            '<h3>4. PROHIBITED USES</h3>' +
                            '<p><b>4.1</b> A user must not use the Services in any way that causes, or may cause, damage to the website or impairment of the availability or accessibility of the website; or in any way which is unlawful, illegal, fraudulent or harmful, or in connection with any unlawful, illegal, fraudulent or harmful purpose or activity. </p>' +
                            '<h3>5. BREACH</h3>' +
                            '<p><b>5.1.</b> Without prejudice to any other rights, if a User breaches in whole or in part any provision contained herein, Counterparty and/or the Services reserve the right to take such action as they deem fit, including terminating this Agreement or any other agreement in place with the User and/or taking legal action against such User.</p>' +
                            '<p><b>5.2.</b> You agree to fully indemnify, defend and hold harmless the Services and their operators and agents from and against all claims, demands, liabilities, damages, losses, costs and expenses, including legal fees and any other charges whatsoever, irrespective of cause, that may arise as a result of: (i) your breach of this Agreement, in whole or in part; (ii) violation by you of any law or any third party rights; and (iii) use by you of the Services.</p>' +
                            '<h3>6. LIMITATION OF LIABILITY</h3>' +
                            '<p><b>6.1.</b> Under no circumstances, including negligence, shall Counterparty nor the Services be liable for any special, incidental, direct, indirect or consequential damages whatsoever (including, without limitation, damages for loss of business profits, business interruption, loss of business information, or any other pecuniary loss) arising out of the use (or misuse) of the Services even if Counterparty and/or the Services had prior knowledge of the possibility of such damages.</p>' +
                            '<h3>7. AMENDMENT</h3>' +
                            '<p>Counterparty and the Services reserve the right to update or modify this Agreement or any part thereof at any time or otherwise change the Services without notice and you will be bound by such amended Agreement upon publication. Therefore, we encourage you check the terms and conditions contained in the version of the Agreement in force at such time. Your continued use of the Service shall be deemed to attest to your agreement to any amendments to the Agreement.</p>' +
                            '<h3>8. GOVERNING LAW</h3>' +
                            '<p>The Agreement and any matters relating hereto shall be governed by, and construed in accordance with, the laws of the state of California and the United States. You irrevocably agree that, subject as provided below, the courts of California shall have exclusive jurisdiction in relation to any claim, dispute or difference concerning the Agreement and any matter arising therefrom and irrevocably waive any right that it may have to object to an action being brought in those courts, or to claim that the action has been brought in an inconvenient forum, or that those courts do not have jurisdiction. Nothing in this clause shall limit the right of the Services to take proceedings against you in any other court of competent jurisdiction, nor shall the taking of proceedings in any one or more jurisdictions preclude the taking of proceedings in any other jurisdictions, whether concurrently or not, to the extent permitted by the law of such other jurisdiction.</p>' +
                            '<h3>9. SEVERABILITY</h3>' +
                            '<p>If a provision of this Agreement is or becomes illegal, invalid or unenforceable in any jurisdiction, that shall not affect the validity or enforceability in that jurisdiction of any other provision hereof or the validity or enforceability in other jurisdictions of that or any other provision hereof.</p>' +
                            '<h3>10. ASSIGNMENT</h3>' +
                            '<p>Counterparty and the Services reserve the right to assign this agreement, in whole or in part, at any time without notice. The User may not assign any of his/her rights or obligations under this Agreement.</p>' +
                            '<h3>11. MISCELLANEOUS</h3>' +
                            '<p><b>11.1.</b> No waiver by Counterparty nor by the Services of any breach of any provision of this Agreement (including the failure of Counterparty and/or the Services to require strict and literal performance of or compliance with any provision of this Agreement) shall in any way be construed as a waiver of any subsequent breach of such provision or of any breach of any other provision of this Agreement.</p>' +
                            '<p><b>11.2.</b> Nothing in this Agreement shall create or be deemed to create a partnership, agency, trust arrangement, fiduciary relationship or joint venture between you the User and Counterparty, nor between you the User and the Services, to any extent.</p>' +
                            '<p><b>11.3.</b> This Agreement constitutes the entire understanding and agreement between you the User and Counterparty and the Services regarding the Services and supersedes any prior agreement, understanding, or arrangement between the same.</p>' +
                '</div>');
            msg.append('<div class="checkbox" id="dialog-license-agreement-confirm"><label><input type="checkbox" id="dialog-license-agreement-checkbox"> I have <u><i><b>read and accept</b></i></u> the above License Agreement.</label></div>');
            return msg;
        },
        buttons:[{
            label: 'Ok',
            icon: 'fa fa-lg fa-fw fa-thumbs-up',
            cssClass: 'btn-success', 
            hotkey: 13,
            action: function(dialog){
                if($('#dialog-license-agreement-checkbox').is(':checked')){
                    ls.setItem('licenseAgreementAccept',1);
                    dialog.close();
                } else {
                    $('#dialog-license-agreement-confirm').effect( "shake", { times: 3, direction: 'up' }, 1000);
                }
            }
        }]
    });
}

// Handle displaying a context menu based on target
function displayContextMenu(event){
   var menu = false;

    // Balances list items context menu
    var el = $( event.target ).closest('.balances-list-item');
    if(el.length!=0){
        var asset = el.attr('data-asset'),
            mnu   = new nw.Menu();
        // Save asset data so it can be accessed in dialog boxes
        FW.DIALOG_DATA = { token: asset };
        mnu.append(new nw.MenuItem({ 
            label: 'View ' + asset + ' Information',
            click: function(){ loadAssetInfo(asset); }
        }));
        mnu.append(new nw.MenuItem({ 
            label: 'View ' + asset + ' Exchange Markets',
            click: function(){ 
                FW.DIALOG_DATA = { market: asset };
                loadPage('exchange'); 
            }
        }));
        mnu.append(new nw.MenuItem({ type: 'separator' }));
        mnu.append(new nw.MenuItem({ 
            label: 'Send ' + asset + ' to...',
            click: function(){ dialogSend(); }
        }));
        if(asset!='BTC' && asset!='XCP'){
            mnu.append(new nw.MenuItem({ 
                label: 'Pay Dividends on ' + asset,
                click: function(){ dialogPayDividend(); }
            }));
        }
        if(asset!='BTC' && asset!='XCP'){
            mnu.append(new nw.MenuItem({ type: 'separator' }));
            mnu.append(new nw.MenuItem({ 
                label: 'Issue ' + asset + ' Supply',
                click: function(){ dialogIssueSupply(); }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Lock ' + asset + ' Supply',
                click: function(){ dialogLockSupply(); }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Change ' + asset + ' Description',
                click: function(){ dialogChangeDescription(); }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Transfer Ownership of ' + asset,
                click: function(){ dialogTransferOwnership(); }
            }));
        }
        menu = mnu;
    }

    // History / Transaction List
    var el = $( event.target ).closest('.history-list-item');
    if(el.length!=0){
        var tx   = el.attr('txhash'),
            mnu  = new nw.Menu();
        mnu.append(new nw.MenuItem({ 
            label: 'View Transaction',
            click: function(){ 
                var txhash = el.attr('txhash'),
                    txtype = el.attr('txtype'),
                    asset  = el.attr('asset');
                loadTransactionInfo({
                    tx: txhash, 
                    type: txtype, 
                    asset: asset
                });
            }
        }));
        mnu.append(new nw.MenuItem({ type: 'separator' }));
        mnu.append(new nw.MenuItem({ 
            label: 'View on XChain.io',
            click: function(){ 
                var url  = FW.XCHAIN_API + '/tx/' + tx;
                nw.Shell.openExternal(url);
            }
        }));
        mnu.append(new nw.MenuItem({ 
            label: 'View on Blocktrail.com',
            click: function(){ 
                var net = (FW.WALLET_NETWORK==2) ? 'tBTC' : 'BTC',
                    url  = 'https://www.blocktrail.com/' + net + '/tx/' + tx;
                nw.Shell.openExternal(url);
            }
        }));
        mnu.append(new nw.MenuItem({ 
            label: 'View on Chain.so',
            click: function(){ 
                var net = (FW.WALLET_NETWORK==2) ? 'BTCTEST' : 'BTC',
                    url  = 'https://chain.so/tx/' + net + '/' + tx;
                nw.Shell.openExternal(url);
            }
        }));
        menu = mnu;
    }

    // Address List 
    var el = $( event.target ).closest('.address-list-item');
    if(el.length!=0){
        var addr = el.attr('data-address'),
            info = getWalletAddressInfo(addr),
            mnu  = new nw.Menu();

        mnu.append(new nw.MenuItem({ 
            label: 'View Address',
            click: function(){ 
                dialogViewAddress(addr);
            }
        }));
        // Don't display 'View Private Key' option for watch-only addresses
        if(info.type!=3){
            mnu.append(new nw.MenuItem({ 
                label: 'View Private Key',
                click: function(){ 
                    dialogViewPrivateKey(addr);
                }
            }));
        }
        mnu.append(new nw.MenuItem({ type: 'separator' }));
        mnu.append(new nw.MenuItem({ 
            label: 'Remove',
            click: function(){ 
                dialogRemoveWalletAddress(addr);
            }
        }));
        menu = mnu;
    }

    // Markets Tabs
    var el = $( event.target ).closest('li.tab');
    if(el.length!=0){
        var mnu    = new nw.Menu(),
            market = el.attr('data-market');
        if(market!='XCP' && market!='BTC'){
            mnu.append(new nw.MenuItem({ 
                label: 'Remove Market',
                click: function(){ 
                    removeMarket(market);
                }
            }));
        }
        menu = mnu;
    }    

    // Markets row
    var el = $( event.target ).closest('tr[data-market]');
    if(el.length!=0){
        var mnu    = new nw.Menu(),
            market = el.attr('data-market');
        if(market!='XCP' && market!='BTC'){
            mnu.append(new nw.MenuItem({ 
                label: 'Open ' + market + ' market',
                click: function(){ 
                    openMarket(market);
                }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Open ' + market + ' market in new window',
                click: function(){ 
                    openMarket(market, true);
                }
            }));
        }
        menu = mnu;
    }    

    // Generic context menu
    if(!menu){
        if(!nw.genericMenu){
            var mnu  = new nw.Menu(),
                clip = nw.Clipboard.get();
            mnu.append(new nw.MenuItem({ 
                label: 'Copy',
                click: function(){ document.execCommand("copy"); }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Cut',
                click: function(){ document.execCommand("cut"); }
            }));
            mnu.append(new nw.MenuItem({ 
                label: 'Paste',
                click: function(){ document.execCommand("paste"); }
            }));
            nw.copyPasteMenu = mnu;
        }
        menu = nw.copyPasteMenu;
    }
    // Display menu at event location
    if(menu)
        menu.popup(event.clientX, event.clientY);
}

// Handle extracting hostname from a url
function getUrlHostname(url){
    var arr  = url.split('/');
    // Remove protocol (http/https)
    var host = (url.indexOf("://") > -1) ? arr[2] : arr[0];
    // Remove Port
    host = host.split(':')[0];
    return host;
}

// Handle processing any URI data that is passed
function processURIData(data){
    if(data){
        var addr = data,
            btc  = /^(bitcoin|counterparty):/i,
            url  = /^(http|https):/i,
            o    = { valid: false };
        // Handle parsing in bitcoin and counterparty URI data
        if(btc.test(data)){
            // Extract data into object
            var x    = data.replace(btc,'').split('?'),
                y    = (x[1]) ? x[1].split('&') : [],
                addr = x[0];
            for (var i = 0; i < y.length; i++){
                var z = y[i].split('=');
                o[decodeURIComponent(z[0])] = decodeURIComponent(z[1]).replace(/\+/g,' ').trim();
            }
        }
        // Use message since bitcoin already uses that name
        if(o.memo)
            o.message = o.memo;
        // Handle validating that the provided address is valid
        if(addr.length>25 && CWBitcore.isValidAddress(addr)){
            o.valid   = true;
            o.address = addr;
        } else {
            // If action is specified, assume valid
            if(o.action)
                o.valid = true;
            if(url.test(data)){
                o.valid = true;
                o.url   = data;
            }
        }
    }
    // If we have valid data, then process it
    if(o.valid){
        // Define callback to prompt user for password, and retry after wallet is unlocked
        var cb = function(){ 
            dialogPassword(false, function(){ 
                processURIData(data); 
            }) 
        };
        // Handle actions
        if(o.action){
            // Handle signing messages
            if(o.action=='sign'){
                // Check if wallet is locked... if so, notify user that they have to unlock wallet
                if(dialogCheckLocked('sign a message', cb))
                    return;
                if(o.callback){
                    // Use given address or default to current address
                    var addr = (o.address) ? o.address : FW.WALLET_ADDRESS,
                        host = getUrlHostname(o.callback),
                        key  = getPrivateKey(FW.WALLET_NETWORK, addr);
                    // Only proceed if we were able to get the key for the address
                    if(key){
                        var sig = signMessage(FW.WALLET_NETWORK, addr, o.message);
                        if(sig){
                            o.address   = addr;
                            o.signature = sig;
                            // Confirm with user that they want to perform callback to remote server
                            FW.DIALOG_DATA = o;
                            dialogConfirmCallback();
                        } else {
                            dialogMessage('Error','Error while trying to sign message!', true);
                        }
                    } else {
                        dialogMessage('Error','Unable to sign message with given address!', true);
                    }
                } else {
                    // Show 'Send' tool and pass forward scanned 
                    FW.DIALOG_DATA = {
                        message: o.message || '',
                    }
                    dialogSignMessage();
                }
            }
            // Show 'Broadcast' dialog box and pass message to broadcast
            if(o.action=='broadcast'){
                // Check if wallet is locked... if so, notify user that they have to unlock wallet
                if(dialogCheckLocked('broadcast a message', cb))
                    return;
                FW.DIALOG_DATA = {
                    message: o.message || '',
                }
                dialogBroadcastMessage();
            }
            // Show 'Sign Transaction' dialog box and pass transaction
            if(o.action=='signtx'){
                // Check if wallet is locked... if so, notify user that they have to unlock wallet
                if(dialogCheckLocked('sign a transaction', cb))
                    return;
                FW.DIALOG_DATA = {
                    tx: o.tx || '',
                }
                dialogSignTransaction();
            }
        } else if(o.address){
            // Check if wallet is locked... if so, notify user that they have to unlock wallet
            if(dialogCheckLocked('send funds', cb))
                return;
            // Show 'Send' tool and pass forward scanned 
            FW.DIALOG_DATA = {
                destination: o.address,
                token: o.asset || 'BTC',
                amount: o.amount || '',
                message: o.message || ''
            }
            dialogSend();
        // Handle processing URL externally
        } else if(o.url && /^(http|https):/i.test(o.url)){
            var host = getUrlHostname(o.url);
            dialogConfirm( 'Are you Sure?', 'Open url to ' + host + '?', false, true, function(){ 
                nw.Shell.openExternal(o.url);
            });
        } else {
            // Throw generic failure message if we were not able to 
            dialogMessage('Error','Unable to perform action using given data!', true);
        }                         
    }
}


/* 
 * Exchange / Markets / Market code
 */

// Function to handle automatically collapsing/expanding tabs to the 'More' menu item
function autoCollapseTabs(rerun=false){
    var tabs  = $('#markets-tabs'),
        more  = $('#markets-tabs-more'),
        last  = $('#markets-last-tab'),
        max   = tabs.width(),
        width = last.width(),
        main  = [],
        menu  = [];
    // Loop through items and add to the correct array 
    tabs.find('li.tab').each(function(idx, item){
        var w = $(item).width();
        width += w;
        if(width <= max){
            main.push(item);
        } else {
            menu.push(item);
        }
    });
    // Move menu items to the correct locations
    main.forEach(function(item){ $(item).insertBefore(last); });
    menu.forEach(function(item){ more.append(item); });
    // Handle hiding/showing the 'More' menu
    if(menu.length==0)
        last.hide();
    else
        last.show();
    // If the tab bar is taller than 50 pixels, we are too tall, re-run the logic
    if(tabs.height()>50 && !rerun)
        autoCollapseTabs(true);
}

// Handle updating the base market pairs
function updateBaseMarkets(force){
    var last   = FW.EXCHANGE_MARKETS['last_updated'] || 0,
        ms     = 300000, // 5 minutes,
        update = ((parseInt(last) + ms) <= Date.now()||force) ? true : false;
    // console.log('updateBaseMarkets update=',update);
    // Callback function to run when we are done updating the market info        
    var cb  = function(o, market){
        updateMarketsView(market);
        FW.EXCHANGE_MARKETS['last_updated'] = Date.now();
    }
    // Loop through base markets and update pairs
    FW.BASE_MARKETS.forEach(function(market){
        if(update)
            updateMarkets(market,1, true, cb);
        else
            cb(null, market);
    });
}


// Handle loading market data, saving to memory, and passing to a callback function
function updateMarkets(market, page, full, callback){
    var page  = (page) ? page : 1,
        limit = 1000,
        count = (page==1) ? 0 : ((page-1)*limit),
        url   = FW.XCHAIN_API + '/api/markets';
    if(market)
        url += '/' + market;
    $.getJSON(url + '/' + page + '/' + limit, function(o){
        if(o.data){
            o.data.forEach(function(item){
                var rec = [FW.WALLET_NETWORK, item.longname, item.price.last, item.price.ask, item.price.bid, item['24hour'].volume.split('|')[1], item['24hour'].percent];
                FW.EXCHANGE_MARKETS[item.name] = rec;
            });
            count += o.data.length;
        }
        // If a full update was requested, keep updating
        if(full && count < o.total){
            updateMarkets(market, page+1, true, callback);
            return;
        }
        if(typeof callback === 'function')
            callback(o, market);
    });
}

// Handle initializing/updating the markets tables
function updateMarketsView(market){
    var table = $('#' + market + ' table.datatable').DataTable(FW.MARKETS_DATATABLE_CONFIG),
        rows = getMarketsRowCount();
    // Define some random records/data for testing
    var data = [];
    // Handle looking up all market pairs for the given market
    for( name in FW.EXCHANGE_MARKETS){
        var rec = JSON.parse(JSON.stringify(FW.EXCHANGE_MARKETS[name])),
            a   = name.split('/'),
            b   = String(rec[1]).split('/');
        // console.log('rec=',rec);
        if(rec[0]==FW.WALLET_NETWORK && (a[1]==market||b[1]==market)){
            // Set asset name to longname|name
            var asset = (rec[1]!='') ? (b[0] + '|' + a[0]) : a[0],
                type  = (asset.substr(0,1)=='A') ? 3 : (asset.indexOf('.')!=-1) ? 2 : 1;
            // Remove network and longname, and add asset
            rec.splice(0,2, asset); 
            // console.log('rec=',rec);
            // Only add record if user wants to view this type of asset
            if(FW.MARKET_OPTIONS.indexOf(type)!=-1)
                data.push(rec);
        }
    }
    // Remove all existing data, add the new data, then redraw the view
    table.clear();
    table.page.len(rows);
    table.rows.add(data);
    table.draw();
}

// Handle removing a market
function removeMarket(market){
    // Remove tab and tab content
    $("li.tab[data-market='" + market + "']").remove();
    $('#' + market).remove();
    // Switch back to BTC tab
    $('#markets-tabs a[href="#BTC"]').tab('show');
    // Handle removing from base pairs 
    if(FW.BASE_MARKETS.indexOf(market)!=-1){
        // Remove market from FW.BASE_MARKETS
        FW.BASE_MARKETS.splice(FW.BASE_MARKETS.indexOf(market),1);
        // Save data to localStorage
        ls.setItem('walletMarkets', JSON.stringify(FW.BASE_MARKETS));
    }
}


// Handle opening a market for viewing
function openMarket(market, win){
    // console.log('openMarket market, win=',market,win);
    // Stash market data so we can easily reference when market loads
    FW.DIALOG_DATA = {
        market: market
    };
    // Open market in new window
    if(win){

    // Open market in exiting window
    } else {
        loadPage('market');
    }
}

// Function to handle loading various chart types
function loadChartType(chart){
    // Handle loading the correct chart
    $('#market-chart-container').load('html/exchange/charts/' + chart + '.html');
    // Load chart data after brief delay to let page load
    setTimeout(function(){
        updateMarketChart(FW.MARKET_NAME);
    },100);
}



/* Market JS (market.html) */
// Quick function to handle destroying a datatable
function destroyDataTable(table){
    if($.fn.DataTable.isDataTable(table))
        $(table).DataTable().clear().destroy();
}

// Function to handle updating address balances
function updateMarketBalancesView(){
    // Update the buy/sell balances
    var asset = String(FW.MARKET_NAME).split('/'),
        a     = getAddressBalance(FW.WALLET_ADDRESS, asset[0]),
        b     = getAddressBalance(FW.WALLET_ADDRESS, asset[1]),
        balA  = (a && a.quantity) ? a.quantity : 0,
        balB  = (b && b.quantity) ? b.quantity : 0;
    $('#buy-balance').val(numeral(balB).format('0,0.00000000'));
    $('#sell-balance').val(numeral(balA).format('0,0.00000000'));
}   

// Handle updating/displaying market information
function updateMarket(market, force){
    var net    = (FW.WALLET_NETWORK==2)  ? 'testnet' : 'mainnet',
        block  = (FW.NETWORK_INFO.network_info) ? FW.NETWORK_INFO.network_info[net].block_height : 1,
        data   = FW.MARKET_DATA[market] || false,
        last   = (data) ? data.block : 0,
        update = (block > last || force) ? true : false;
    // Initialize the market data cache
    if(!FW.MARKET_DATA[market])
        FW.MARKET_DATA[market] = {}
    //  Update the buy/sell asset balances
    updateMarketBalancesView();    
    if(update){
        // Set block height for this data so we can request new data if block changes
        FW.MARKET_DATA[market].block = block;
        // Update market data and save in FW.MARKET_DATA[market] cache
        updateMarketBasics(market);
        updateMarketAssetInfo(market);
        updateMarketOrderbook(market);
        updateMarketHistory(market);
        updateMarketHistory(market, FW.WALLET_ADDRESS);
        updateMarketOrders(market, FW.WALLET_ADDRESS);
        // Get all market chart data then update the chart
        updateMarketChartData(market, 1, true, function(data){
            FW.MARKET_DATA[market].chart = data;
            updateMarketChart(market);
        });
    } else {
        // Update views using cached data
        updateMarketBasicsView(market);
        updateMarketAssetInfo(market);
        updateMarketOrderbookView(market);
        updateMarketHistoryView(market);
        updateMarketHistoryView(market, FW.WALLET_ADDRESS);
        updateMarketOrdersView(market, FW.WALLET_ADDRESS);
        updateMarketChart(market, 10); // delay loading by 10ms to allow chart content to load
    }
}

// Handle updating market 'basics' data
function updateMarketBasics( market ){
    $.getJSON(FW.XCHAIN_API + '/api/market/' + market, function(o){
        if(o.error){
            console.log('Error: ',o.error);
        } else {
            FW.MARKET_DATA[market].basics = o;
            updateMarketBasicsView(market);
        }
    });
}

// Handle updating market 'Orderbook' data
function updateMarketOrderbook( market ){
    $.getJSON(FW.XCHAIN_API + '/api/market/' + market + '/orderbook', function(o){
        if(o.error){
            console.log('Error: ',o.error);
        } else {
            FW.MARKET_DATA[market].orderbook = o;
            updateMarketOrderbookView(market);
        }
    });
}

// Handle updating market history/trade data
function updateMarketHistory(market, address){
    var base = FW.XCHAIN_API + '/api/market/' + market + '/history',
        url  = (address) ? base + '/' + address : base;
    // console.log('updateMarketHistory url=',url);
    $.getJSON(url, function(o){
        if(o.error){
            console.log('Error: ',o.error);
        } else {
            if(address){
                FW.MARKET_DATA[market].trades  = o;
            } else {
                FW.MARKET_DATA[market].history = o;
            }
            updateMarketHistoryView(market, address);
        }
    });
}

// Handle updating 'my open orders' data
function updateMarketOrders(market, address){
    // console.log('updateMarketOrders market,address=',market,address);
    // Get Basic Market information (name, price, volume, etc)
    $.getJSON(FW.XCHAIN_API + '/api/market/' + market + '/orders/' + address, function(o){
        if(o.error){
            console.log('Error: ',o.error);
        } else {
            FW.MARKET_DATA[market].orders = o;
            updateMarketOrdersView(market, address);
        }
    });
}

// Handle updating market 'basics' view
function updateMarketBasicsView( market ){
    var o        = FW.MARKET_DATA[market].basics,
        assets   = o.name.split('/'),
        longname = String(o.longname).split('/'),
        volume   = String(o['24hour'].volume).split('|'),
        name     = (o.longname!='') ? longname[0] : assets[0],
        fullname = (o.longname!='') ? o.longname : o.name;
        fmt      = (o.price.last.indexOf('.')!=-1) ? '0,0.00000000' : '0,0';
    $('div.market-name').text(name + ' EXCHANGE');
    $('.market-icon img').attr('src', FW.XCHAIN_API + '/icon/' + assets[0] + '.png');
    $('.market-pair img').attr('src', FW.XCHAIN_API + '/icon/' + assets[1] + '.png');
    $('.market-pair span').text(o.name);
    $('#last-price').text(numeral(o.price.last).format(fmt));
    var pct = numeral(o['24hour'].percent_change).format('0,0.00') + '%',
        cls = (pct.indexOf('-')==-1) ? 'green' : 'red';
    if(pct.indexOf('-')==-1)
        pct = '+' + pct;
    $('#24h-change').text(pct).removeClass('red green').addClass(cls);
    $('#24h-high').text(numeral(o['24hour'].high).format(fmt));
    $('#24h-low').text(numeral(o['24hour'].low).format(fmt));
    $('#24h-price').text(numeral(o['24hour'].price).format(fmt));
    var fmt = (volume[0].indexOf('.')!=-1) ? '0,0.00000000' : '0,0';
    $('#asset1-volume').text(numeral(volume[0]).format(fmt));
    var fmt = (volume[1].indexOf('.')!=-1) ? '0,0.00000000' : '0,0';
    $('#asset2-volume').text(numeral(volume[1]).format(fmt));
    $('.asset1-name').text(assets[0]);
    $('.asset2-name').text(assets[1]);
    $('.market-name-short').text(assets[0]);    
}

// Handle updating market 'Orderbook' view
function updateMarketOrderbookView( market ){
    var o = FW.MARKET_DATA[market].orderbook;
    // Update the market depth chart
    updateMarketDepthChart(market, o);
    // Calculate amount and sum for asks
    var asks  = 0,
        bids  = 0,
        total = 0,
        ask   = '0.00000000',
        bid   = '0.00000000';
    $.each(o.asks, function(idx, data){
        if(idx==0)
            ask = numeral(parseFloat(data[0])).format('0.00000000');
        data[2] = numeral(parseFloat(data[0]) * parseFloat(data[1])).format('0.00000000');
        data[3] = numeral(parseFloat(total) + parseFloat(data[2])).format('0.00000000');
        asks    = numeral(parseFloat(asks) + parseFloat(data[1])).format('0.00000000');
        total   = data[3];
    });
    // Calculate amount and sum for bids
    $.each(o.bids, function(idx, data){
        if(idx==0)
            bid = numeral(parseFloat(data[0])).format('0.00000000');
        data[2] = numeral(parseFloat(data[0]) * parseFloat(data[1])).format('0.00000000');
        data[3] = numeral(parseFloat(bids) + parseFloat(data[2])).format('0.00000000');
        bids    = data[3];
    });
    // Initialize the sell orders table
    var table = '#orderbook-sells table.tinytable';
    destroyDataTable(table);
    $(table).DataTable({
        data:           o.asks,
        dom:            't',
        sortable:       false,
        searching:      false,
        ordering:       false,
        scrollY:        "300px",
        scrollCollapse: false,
        paging:         false,
        language: {
            emptyTable: "No sell orders found"
        },
        drawCallback: function( settings ){
            // Display total amount 
            $('#orderbook-sells .total-amount').text(numeral(asks).format('0,0.00000000'));
            // Set default buy price  (lowest sell order)
            $('#buy-price').val(ask);
        },
        createdRow: function( row, data, idx ){
            var fmt = '0,0.00000000'
            $('td', row).eq(0).text(numeral(data[0]).format(fmt));
            $('td', row).eq(1).text(numeral(data[1]).format(fmt));
            $('td', row).eq(2).text(numeral(data[2]).format(fmt));
            $('td', row).eq(3).text(numeral(data[3]).format(fmt));
        }
    });
    // Initialize the buy orders table
    var table = '#orderbook-buys table.tinytable';
    destroyDataTable(table);
    $(table).DataTable({
        data:           o.bids,
        dom:            't',
        sortable:       false,
        searching:      false,
        ordering:       false,
        scrollY:        "300px",
        scrollCollapse: false,
        paging:         false,
        language: {
            emptyTable: "No buy orders found"
        },
        drawCallback: function( settings ){
            // Display total amount
            $('#orderbook-buys .total-amount').text(numeral(bids).format('0,0.00000000'));
            // Set default sell price (highest buy order)
            $('#sell-price').val(bid);
        },
        createdRow: function( row, data, idx ){
            var fmt = '0,0.00000000'
            $('td', row).eq(0).text(numeral(data[0]).format(fmt));
            $('td', row).eq(1).text(numeral(data[1]).format(fmt));
            $('td', row).eq(2).text(numeral(data[2]).format(fmt));
            $('td', row).eq(3).text(numeral(data[3]).format(fmt));
        }
    });
}

// Handle updating market history view
function updateMarketHistoryView(market, address){
    var info = FW.MARKET_DATA[market],
        o    = (address) ? info.trades : info.history,
        data = [];
    $.each(o.data, function(idx, item){
        var rec = [item.timestamp, item.type, item.price, item.amount, item.total, item.tx_index];
        data.push(rec);
    });
    var id = (address) ? 'my-trade-history' : 'market-trade-history',
        txt = 'No'
    var table = '#' + id + ' table';
    destroyDataTable(table)
    $(table).DataTable({
        data:           data,
        dom:            't',
        sortable:       false,
        searching:      false,
        ordering:       false,
        scrollY:        "300px",
        scrollCollapse: false,
        paging:         false,
        columns: [
            { className: "text-left nowrap" },
            null,
            null,
            null,
            null
        ],
        language: {
            emptyTable: "No trades found"
        },
        createdRow: function( row, data, idx ){
            var fmt = '0,0.00000000'
            var cls = (data[1]=='sell') ? 'red' : 'green';
            $('td', row).eq(0).html('<a href="' + FW.XCHAIN_API + '/tx/' + data[5] + '" target="_blank">' + moment.unix(data[0]).format('MM/DD/YY HH:mm') + '</a>');
            $('td', row).eq(1).removeClass('red green').addClass(cls);
            $('td', row).eq(2).text(numeral(data[2]).format(fmt));
            $('td', row).eq(3).text(numeral(data[3]).format(fmt));
            $('td', row).eq(4).text(numeral(data[4]).format(fmt));
        }
    });
}

// Handle updating asset information (supply, locked, price, reputation, etc)
function updateMarketAssetInfo(market){
    var market = (market) ? market : FW.MARKET_NAME;
    $.each(String(market).split('/'), function(idx, asset){
        var sel = '#asset' + (idx+1) + '-info';
        // Handle requesting asset info
        getAssetInfo(asset, function(o){
            if(o.asset){
                // Set quick reference flag divisibiliy
                FW.ASSET_DIVISIBLE[o.asset] = o.divisible;
                // FW['ASSET' + (idx+1) + '_DIVISIBLE'] = o.divisible;
                var fmt    = (o.divisible) ? '0,0.00000000' : '0,0',
                    lock   = $(sel + ' .supply-lock'),
                    icon   = $(sel + ' .asset-icon'),
                    more   = $(sel + ' .more-info'),
                    supply = $(sel + ' .supply-total'),
                    usd    = $(sel + ' .last-price-usd'),
                    xcp    = $(sel + ' .last-price-xcp');
                supply.text(numeral(o.supply).format(fmt));
                if(o.locked){
                    lock.removeClass('fa-unlock').addClass('fa-lock');
                } else {
                    lock.removeClass('fa-lock').addClass('fa-unlock');
                }
                xcp.text(numeral(o.estimated_value.xcp).format('0,0.00000000'));
                usd.text(numeral(o.estimated_value.usd).format('0,0.00'));
                icon.attr('src',FW.XCHAIN_API + '/icon/' + asset + '.png');
                more.attr('href',FW.XCHAIN_API + '/asset/' + asset);
            }
        });
        // Handle requesting reputation info from coindaddy.io
        getAssetReputationInfo(asset, function(o){ 
            if(!o.error){
                var rating = o['rating_current'],
                    text   = (rating>0) ? rating : 'NA',
                    html   = '<a href="https://reputation.coindaddy.io/xcp/asset/' + asset + '" data-toggle="tooltip" data-placement="bottom" title="View Feedback" target="_blank"><div class="rateit" data-rateit-readonly="true" data-rateit-value="' + rating + '" data-rateit-ispreset="true"></div></a> <span class="rateit-score">' + text + '</span>';
                html += '<a href="#" class="btn btn-xs btn-success pull-right" data-toggle="tooltip" data-placement="left" title="Leave Feedback" target="_blank"><i class="fa fa-lg fa-bullhorn auto-width"></i></a>'
                $(sel + ' .reputation').html(html);
                $('.rateit').rateit();
                $('[data-toggle="tooltip"]').tooltip({ html: true });
            }
        });
    });
}


// Handle updating 'my open orders' view
function updateMarketOrdersView(market, address){
    // console.log('updateMarketOrders market,address=',market,address);
    var o = FW.MARKET_DATA[market].orders;
    var data = [];
    $.each(o.data, function(idx, item){
        var rec = [item.timestamp, item.type, item.price, item.amount, item.total, item.tx_index, item.expires, item.tx_hash];
        data.push(rec);
    });
    var id = (address) ? 'my-trade-history' : 'market-trade-history',
        txt = 'No'
    $('#open-orders table').DataTable({
        data:           data,
        dom:            't',
        sortable:       false,
        searching:      false,
        ordering:       false,
        destroy:        true,  // automatically destroy and re-create this datatable if it has already been initialized
        scrollY:        "300px",
        scrollCollapse: false,
        paging:         false,
        columns: [
            { className: "text-left nowrap" },
            null,
            null,
            null,
            { className: "no-right-border" },
            { className: "text-right nowrap" }
        ],
        language: {
            emptyTable: "No open orders found"
        },
        drawCallback: function(){
            // Initialize any tooltips
            $('[data-toggle="tooltip"]').tooltip({ html: true });
        },
        createdRow: function( row, data, idx ){
            var fmt = '0,0.00000000',
                cls = (data[1]=='sell') ? 'red' : 'green',
                blk = 
                txt = '<a data-toggle="tooltip" data-placement="right" title="Order expires at block #' + numeral(data[6]).format('0,0') + '"><i class="fa fa-lg fa-info-circle"></i></a>';
            txt += '<a href="' + FW.XCHAIN_API + '/tx/' + data[5] + '" target="_blank">' + moment.unix(data[0]).format('MM/DD/YY HH:mm') + '</a>';;
            $('td', row).eq(0).html(txt);
            $('td', row).eq(1).removeClass('red green').addClass(cls);
            $('td', row).eq(2).text(numeral(data[2]).format(fmt));
            $('td', row).eq(3).text(numeral(data[3]).format(fmt));
            $('td', row).eq(4).text(numeral(data[4]).format(fmt));
            $('td', row).eq(5).html('<a href="#" class="red cancel-button" data-toggle="tooltip" data-placement="left" title="Cancel" data-tx="' + data[7] + '"><i class="fa fa-lg fa-times-circle auto-width"></i></a>');
        }
    });
}

// Handle loading market data, saving to memory, and passing to a callback function
function updateMarketChartData(market, page, full, callback){
    var page  = (page) ? page : 1,
        limit = 2500,
        count = (page==1) ? 0 : ((page-1)*limit),
        url   = FW.XCHAIN_API + '/api/market/' + market + '/chart';
    // Reset any stored chart data
    if(full && page==1)
        FW.RAW_CHART_DATA = [];
    $.getJSON(url + '/' + page + '/' + limit, function(o){
        if(o.data){
            o.data.forEach(function(data){
                FW.RAW_CHART_DATA.push(data);
            });
            count += o.data.length;
        }
        // If a full update was requested, keep updating
        if(full && count < o.total){
            updateMarketChartData(market, page+1, true, callback);
            return;
        }
        // Break raw data up into useful arrays 
        var data    = FW.RAW_CHART_DATA,
            trades  = [], // Time / Price
            ohlc    = [], // Time / Open / High / Low / Close
            volume  = [], // Timestamp / Volume (trades)
            volume2 = [], // Timestamp / Volume (ohlc)
            tstamp  = 0,
            open    = 0,
            high    = 0,
            low     = 0,
            close   = 0,
            vol     = 0;
        // Sort the data by date oldest to newest
        data.sort(function(a,b){
            if(a[0] < b[0]) return -1;
            if(a[0] > b[0]) return 1;
            return 0;            
        });
        // Split data into price and volume arrays
        // Multiply timestamp by 1000 to convert to milliseconds
        $.each(data,function(idx, item){
            trades.push([item[0] * 1000,item[1]]);  // Time / Price
            volume.push([item[0] * 1000,item[2]]); // Time / Volume
        });
        // Split data into ohlc and volume arrays
        $.each(data,function(idx, item){
            if(item[0]==tstamp){
                close  = item[1];
                if(item[1]>high) high = item[1];
                if(item[1]<low)  low  = item[1];
                vol = parseFloat(vol) + parseFloat(item[2]);
            } else {
                // Add data to the arrays
                if(tstamp){
                    var ms = tstamp * 1000; // Multiply timestamp by 1000 to convert to milliseconds
                    ohlc.push([ms, open, high, low, close]);
                    volume2.push([ms, vol]);
                }
                // Update stats
                tstamp = item[0];
                open   = close;
                high   = item[1];
                low    = item[1];
                close  = item[1];
                vol    = item[2];
            }
        });
        // Save the processed chart data for easy reference
        FW.CHART_DATA = {
            trades: {
                trades: trades,
                volume: volume
            },
            ohlc: {
                ohlc: ohlc,
                volume: volume2
            }
        }
        // Call the callback
        if(typeof callback === 'function')
            callback(FW.CHART_DATA);
    });
}
