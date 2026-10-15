import { useMemo } from 'react';
import { createApplicationNetworkClient } from '../services/ApplicationNetworkClient';

export const useApi = () => useMemo(() => createApplicationNetworkClient(), []);
