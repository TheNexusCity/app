import _CONTRACTS from 'https://contracts.webaverse.com/config/addresses.js';
import _CONTRACT_ABIS from 'https://contracts.webaverse.com/config/abi.js';

/// //////// mumbai.polygon testnet (mintfee = 0) ////////////////////
// export const AccountcontractAddress = '0xF0118e4e3d2074a0621C5C8e4A5Cf761ef1eFc7b';
// export const FTcontractAddress = '0xf1C659696598647a0544c61D24b360e740D62634';
// export const FTProxycontractAddress = '0xEeA97406Ce6154e3b189D5FA53790c81ecf1cBD3';
// export const NFTcontractAddress = '0x9140B5A048C03A22861E7b4c380cA68A5A3Ee98F';
// export const NFTProxycontractAddress = '0xE5a15065b0E8446c2E35879713EBBf339b004a67';
// export const LANDcontractAddress = '0xcfb59Be415BC927bacf781d7Ed7B74a0Cb4aCE11';
// export const LANDProxycontractAddress = '0x142B0a5F708D399b77349563F273Ad6C03EC28D2';
// export const TradecontractAddress = '0x4D9486D6FBb53234616C9b1997BC31C649336948';

export const WebaverseContract = {
    PolygonContract : {
        AccountcontractAddress : '0xF0118e4e3d2074a0621C5C8e4A5Cf761ef1eFc7b',
        FTcontractAddress : '0xf1C659696598647a0544c61D24b360e740D62634',
        FTProxycontractAddress : '0xEeA97406Ce6154e3b189D5FA53790c81ecf1cBD3',
        NFTcontractAddress : '0x9140B5A048C03A22861E7b4c380cA68A5A3Ee98F',
        NFTProxycontractAddress : '0xE5a15065b0E8446c2E35879713EBBf339b004a67',
        LANDcontractAddress : '0xcfb59Be415BC927bacf781d7Ed7B74a0Cb4aCE11',
        LANDProxycontractAddress : '0x142B0a5F708D399b77349563F273Ad6C03EC28D2',
        TradecontractAddress : '0x4D9486D6FBb53234616C9b1997BC31C649336948'
    },
    SideChainContract : {
        AccountcontractAddress : '0xa9A8417bcb1F0957110b2B8876827C9400a5F16E',
        FTcontractAddress : '0xa0220Cc38Ec4693b3Ccc901fdea7bF9F6A6e7EA0',
        FTProxycontractAddress : '0xD8861A993e06B730117ee2CcD797d3552D192A57',
        NFTcontractAddress : '0x226aedB52AA7E7505BD89756680403E81ad75A46',
        NFTProxycontractAddress : '0x4dC1be8466a8e3AB97a0eF8873a6A64A9f77D0FB',
        LANDcontractAddress : '0x12049fE8b58930f9A170dC6F48cC6778C4c1126a',
        LANDProxycontractAddress : '0x5Ae6AB9F8c6A1BF2E6172659438f1f135e7b7Dd9',
        TradecontractAddress : '0x7e03Ca37526f4b4F4C03E61A8535a2f6B5F25207'
    }
}

/// ///////////////////////////////////////////////////////////////////

export const isLocal = window.location.host.includes('localhost');

export const CONTRACTS = _CONTRACTS;
export const CONTRACT_ABIS = _CONTRACT_ABIS;

export const CHAINS = {
  LOCALHOST: {
    name: 'Localhost',
    chainId: '0x539',
  },
  RINKBY: {
    chainName: 'RinkyBy Test Network',
    name: 'RinkyBy',
    chainId: '0x4',
    blockExplorerUrls: ['https://rinkeby.etherscan.io'],
    symbol: 'ETH',
    rpcUrls: ['https://rinkeby.infura.io/v3/'],
    contract_name: 'testnet',
    previewLink: 'https://rinkeby.etherscan.io/address/',
  },
  ETHEREUM_MAIN: {
    chainName: 'Ethereum Mainnet',
    name: 'Ethereum Mainnet',
    blockExplorerUrls: ['https://etherscan.io'],
    chainId: '0x1',
    symbol: 'ETH',
    rpcUrls: ['https://mainnet.infura.io/v3/'],
    contract_name: 'mainnet',
    previewLink: 'https://etherscan.io/address/',
  },
  // AVALANCHE_MAIN: {
  //   chainName: 'Avalanche Network',
  //   name: 'Avalanche',
  //   blockExplorerUrls: ['https://snowtrace.io/'],
  //   chainId: '0xa86a',
  //   symbol: 'AVAX',
  //   decimals: 18,
  //   rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
  // },
  POLYGON_MAIN: {
    chainName: 'Polygon Mainnet',
    name: 'Polygon',
    blockExplorerUrls: ['https://polygonscan.com/'],
    chainId: '0x137',
    symbol: 'MATIC',
    rpcUrls: ['https://polygon-rpc.com'],
    decimals: 18,
    contract_name: 'polygon',
    previewLink: 'https://polygonscan.com/address/',
  },
  POLYGON_TEST: {
    chainName: 'Mumbai Testnet',
    name: 'Polygon',
    blockExplorerUrls: ['https://mumbai.polygonscan.com/'],
    chainId: '0x13881',
    symbol: 'MATIC',
    rpcUrls: [
      // 'https://rpc-mumbai.matic.today/',
      'https://matic-mumbai.chainstacklabs.com'],
    decimals: 18,
    contract_name: 'testnetpolygon',
    previewLink: 'https://polygonscan.com/address/',
  },
};

export const NETWORK_KEYS = Object.keys(CHAINS);
export const DEFAULT_CHAIN = CHAINS.POLYGON_TEST;
