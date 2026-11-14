/**
 * Firestore security rules tests. Run with the emulator:
 *   npm run test:rules
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';

let env;
const OWNER = { uid: 'owner1', email: 'Owner@PureLab.test', email_verified: true };
const STAFF = { uid: 'staff1', email: 'staff@purelab.test', email_verified: true };
const STRANGER = { uid: 'x1', email: 'stranger@evil.test', email_verified: true };
const UNVERIFIED = { uid: 'u1', email: 'staff@purelab.test', email_verified: false };

const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: u.email_verified }).firestore();
const record = (id, updated_at, device_id = 'dev-a', extra = {}) => ({
  data: { id, name: `Item ${id}`, updated_at, device_id, deleted: 0, ...extra },
  updated_at, device_id, deleted: false, server_updated: serverTimestamp(),
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-purelab',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

async function claimOwner() {
  await assertSucceeds(setDoc(doc(as(OWNER), 'pl_meta/owner'),
    { uid: OWNER.uid, email: OWNER.email.toLowerCase(), created_at: serverTimestamp() }));
}

test('first verified user can claim ownership exactly once', async () => {
  await assertFails(setDoc(doc(as(UNVERIFIED), 'pl_meta/owner'),
    { uid: UNVERIFIED.uid, email: UNVERIFIED.email, created_at: serverTimestamp() }));
  await assertFails(setDoc(doc(as(STRANGER), 'pl_meta/owner'),
    { uid: OWNER.uid, email: STRANGER.email, created_at: serverTimestamp() })); // not themselves
  await claimOwner();
  await assertFails(setDoc(doc(as(STRANGER), 'pl_meta/owner'),
    { uid: STRANGER.uid, email: STRANGER.email, created_at: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as(OWNER), 'pl_meta/owner')));
});

test('strangers and unapproved users cannot read or write data', async () => {
  await claimOwner();
  await assertSucceeds(setDoc(doc(as(OWNER), 'pl_products/p1'), record('p1', 100)));
  await assertFails(getDoc(doc(as(STRANGER), 'pl_products/p1')));
  await assertFails(getDocs(collection(as(STRANGER), 'pl_invoices')));
  await assertFails(setDoc(doc(as(STRANGER), 'pl_products/p2'), record('p2', 100)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pl_products/p1')));
});

test('owner approves staff; staff can work; unverified staff email cannot', async () => {
  await claimOwner();
  await assertFails(setDoc(doc(as(STAFF), 'pl_customers/c1'), record('c1', 5)));
  await assertFails(setDoc(doc(as(STRANGER), 'pl_staff/stranger@evil.test'),
    { email: 'stranger@evil.test', added_at: serverTimestamp() })); // cannot self-approve
  await assertSucceeds(setDoc(doc(as(OWNER), 'pl_staff/staff@purelab.test'),
    { email: 'staff@purelab.test', added_at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as(STAFF), 'pl_staff/staff@purelab.test'))); // can check own status
  await assertSucceeds(setDoc(doc(as(STAFF), 'pl_customers/c1'), record('c1', 5)));
  await assertSucceeds(getDocs(collection(as(STAFF), 'pl_customers')));
  await assertFails(getDoc(doc(as(UNVERIFIED), 'pl_customers/c1')));
  await assertSucceeds(deleteDoc(doc(as(OWNER), 'pl_staff/staff@purelab.test')));
  await assertFails(getDoc(doc(as(STAFF), 'pl_customers/c1'))); // access revoked immediately
});

test('last-write-wins is enforced by the server', async () => {
  await claimOwner();
  const db = as(OWNER);
  await assertSucceeds(setDoc(doc(db, 'pl_invoices/i1'), record('i1', 200, 'dev-b')));
  await assertFails(setDoc(doc(db, 'pl_invoices/i1'), record('i1', 150, 'dev-z'))); // older
  await assertFails(setDoc(doc(db, 'pl_invoices/i1'), record('i1', 200, 'dev-a'))); // tie, lower device
  await assertSucceeds(setDoc(doc(db, 'pl_invoices/i1'), record('i1', 200, 'dev-c'))); // tie, higher device
  await assertSucceeds(setDoc(doc(db, 'pl_invoices/i1'), record('i1', 300, 'dev-a'))); // newer
  const snap = await getDoc(doc(db, 'pl_invoices/i1'));
  assert.equal(snap.get('updated_at'), 300);
  await assertFails(deleteDoc(doc(db, 'pl_invoices/i1'))); // soft-delete only
});

test('malformed records are rejected', async () => {
  await claimOwner();
  const db = as(OWNER);
  const bad = record('p9', 1);
  await assertFails(setDoc(doc(db, 'pl_products/p9'), { ...bad, data: { ...bad.data, id: 'other' } }));
  await assertFails(setDoc(doc(db, 'pl_products/p9'), { ...bad, server_updated: 123 }));
  await assertFails(setDoc(doc(db, 'pl_products/p9'), { ...bad, extra: true }));
  await assertFails(setDoc(doc(db, 'not_a_table/x'), bad));
});
