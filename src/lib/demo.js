/** Demo catalogue + customers so a fresh install can be explored immediately. */
import { saveProduct, saveCustomer } from '../db/repo.js';

const PRODUCTS = [
  ['PureLab Hyaluronic Serum 30ml', 'PL-HS-030', '6291100100017', 'Dermo-cosmetic', 'HS24B07', '2027-06-30', 29.9, 11.2, 0, 48],
  ['PureLab Niacinamide 10% Serum 30ml', 'PL-NS-030', '6291100100024', 'Dermo-cosmetic', 'NS24C11', '2027-03-31', 24.5, 8.9, 0, 36],
  ['PureLab Mineral Sunscreen SPF50+ 50ml', 'PL-SP-050', '6291100100031', 'Dermo-cosmetic', 'SP25A02', '2026-12-31', 32.0, 12.5, 0, 60],
  ['PureLab Gentle Cleansing Gel 200ml', 'PL-CG-200', '6291100100048', 'Dermo-cosmetic', 'CG24D19', '2027-09-30', 18.75, 6.1, 0, 25],
  ['PureLab Repair Cream Ceramide 50ml', 'PL-RC-050', '6291100100055', 'Dermo-cosmetic', 'RC24E03', '2027-01-31', 27.0, 9.8, 0, 8],
  ['PureLab Vitamin C 20% Serum 15ml', 'PL-VC-015', '6291100100062', 'Dermo-cosmetic', 'VC24F21', '2026-12-15', 34.9, 13.4, 0, 14],
  ['Paracetamol 500mg Tablets x24', 'PL-PA-500', '6291100200014', 'Pharmaceutical', 'PA25010', '2028-02-28', 3.5, 1.1, 0, 200],
  ['Ibuprofen 400mg Tablets x20', 'PL-IB-400', '6291100200021', 'Pharmaceutical', 'IB24112', '2027-11-30', 4.9, 1.6, 0, 120],
  ['Cetirizine 10mg Tablets x30', 'PL-CE-010', '6291100200038', 'Pharmaceutical', 'CE24081', '2027-08-31', 5.75, 1.9, 0, 6],
  ['Vitamin D3 1000IU Softgels x60', 'PL-VD-060', '6291100300011', 'Supplement', 'VD25003', '2027-05-31', 12.0, 4.2, 0, 80],
];

const CUSTOMERS = [
  { name: 'Al Noor Pharmacy', type: 'Pharmacy', phone: '+1 555 0101', email: 'orders@alnoor.example', address: '12 Market Street', taxId: 'PH-22981', creditLimit: 5000 },
  { name: 'Derma Care Clinic', type: 'Clinic', phone: '+1 555 0145', email: 'purchasing@dermacare.example', address: '4 Medical Plaza, Suite 3', taxId: 'CL-11204', creditLimit: 3000 },
  { name: 'Sara Haddad', type: 'Retail', phone: '+1 555 0199', email: 'sara@example.com' },
];

export async function loadDemoData(defaultTaxRate = 0) {
  for (const [name, sku, barcode, category, batchNumber, expiryDate, price, cost, , stock] of PRODUCTS) {
    await saveProduct({
      name, sku, barcode, category, batchNumber, expiryDate, price, cost, brand: 'PureLab',
      taxRate: category === 'Pharmaceutical' ? 0 : defaultTaxRate, reorderLevel: 10, unit: 'pcs',
    }, { openingStock: stock });
  }
  for (const c of CUSTOMERS) await saveCustomer(c);
  return { products: PRODUCTS.length, customers: CUSTOMERS.length };
}
