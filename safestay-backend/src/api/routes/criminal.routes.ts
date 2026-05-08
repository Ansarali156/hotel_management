import { Router } from 'express';
import { criminalUpload } from '../../config/multer';
import {
  createCriminalProfile, updateCriminalProfile,
  getCriminalProfile, listCriminalProfiles, deleteCriminalProfile,
} from '../controllers/criminal.controller';
import { requirePoliceAuth, requireMinRank } from '../middleware/requireAuth';

const router = Router();

// Mutating routes — must be an authenticated police officer with sufficient rank.
// Rank model (Indian police — lower number = more senior):
//   1-8   = DGP through DSP (can delete records)
//   9-12  = Inspector / SI / ASI / Head Constable (can create and update FIRs)
//   13-14 = Constables (read-only)
//
// Creates and updates open a new FIR-like record, so we require rank <=12
// (Head Constable or senior). Deletes remove evidence entirely, so we
// require rank <=8 (DSP or senior).
router.post('/', requirePoliceAuth, requireMinRank(12), criminalUpload.single('photo'), createCriminalProfile);
router.put('/:id', requirePoliceAuth, requireMinRank(12), criminalUpload.single('photo'), updateCriminalProfile);
router.delete('/:id', requirePoliceAuth, requireMinRank(8), deleteCriminalProfile);

// Reads expose the entire criminal database (names, aliases, crimes,
// threat level, FIR station).  Any unauthenticated read is a public leak
// of sensitive investigative data, so both list + detail are police-only.
router.get('/:id', requirePoliceAuth, getCriminalProfile);
router.get('/', requirePoliceAuth, listCriminalProfiles);

export default router;
