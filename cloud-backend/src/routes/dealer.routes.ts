import { Router } from 'express';
import { auth, dealerOnly } from '../middleware/auth.middleware';
import {
  getDealerDashboard,
  getDealerCustomers,
  getDealerUsers,
  getDealerUser,
  createDealerCustomer,
  updateDealerCustomer,
  deleteDealerCustomer,
  updateDealerProfile,
} from '../controllers/dealer.controller';
import {
  uploadLogoFile,
  setDealerLogo,
  deleteDealerLogo,
} from '../controllers/branding.controller';
import {
  assignDevices,
  getSubUsers,
  createSubUser,
  updateSubUser,
  deleteSubUser,
} from '../controllers/user.controller';

const router = Router();

router.use(auth, dealerOnly);

router.get('/dashboard', getDealerDashboard);

// Tree users (customers + their sub-users) — admin-parity list/detail
router.get('/users', getDealerUsers);
router.get('/users/:id', getDealerUser);

// Customer accounts (the dealer's own users)
router.get('/customers', getDealerCustomers);
router.post('/customers', createDealerCustomer);
router.put('/customers/:id', updateDealerCustomer);
// Device assignment reuses the admin assignDevices logic — it already
// enforces dealer scope (own customers only) and the tree deviceLimit.
router.post('/customers/:id/devices', assignDevices);
router.delete('/customers/:id', deleteDealerCustomer);

// Sub-users of a customer account — same logic as the customer's own CMS,
// scoped to the dealer's customers (resolveSubUserParent validates ownership).
router.get('/customers/:customerId/sub-users', getSubUsers);
router.post('/customers/:customerId/sub-users', createSubUser);
router.put('/customers/:customerId/sub-users/:id', updateSubUser);
router.delete('/customers/:customerId/sub-users/:id', deleteSubUser);

// Dealer's own profile
router.put('/profile', updateDealerProfile);

// Dealer branding logo
router.post('/logo', uploadLogoFile, setDealerLogo);
router.delete('/logo', deleteDealerLogo);

export default router;
