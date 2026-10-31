import { Linking } from 'react-native';
import { createApplicationNetworkClient } from '../ApplicationNetworkClient';
import { LastFmController, LastFmPolicy } from './LastFmController';
const network = createApplicationNetworkClient();
export const lastFmSettings = new LastFmController(
  {
    status: async signal =>
      (await network.get(LastFmPolicy.status, { signal })).data,
    authorization: async signal =>
      (await network.get(LastFmPolicy.authorization, { signal })).data.authUrl,
    connect: async (token, signal) => {
      await network.post(LastFmPolicy.connect, { token }, { signal });
    },
    disconnect: async signal => {
      await network.delete(LastFmPolicy.disconnect, { signal });
    },
  },
  {
    open: async address => {
      if (!(await Linking.canOpenURL(address))) return false;
      await Linking.openURL(address);
      return true;
    },
  },
);
