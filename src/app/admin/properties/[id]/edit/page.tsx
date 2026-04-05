"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function PropertyEditor({ params }: { params: Promise<{ id: string }> }) {
 const router = useRouter();
 const resolvedParams = use(params);
 const propertyId = resolvedParams.id;

 const [activeTab, setActiveTab] = useState("overview");
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 // The 68-Field Buildout Standard Schema State
 const [formData, setFormData] = useState({
 title: "",
 status: "active",
 visibility: { transactionLabel: "For Sale", saleActive: true, leaseActive: false },
 property: { category: "Retail", buildingSizeSf: "", lotSizeAcres: "", yearBuilt: "" },
 address: { full: "", street: "", city: "", state: "", zip: "" },
 pricing: { hideSalePrice: false, salePriceDollars: "" },
 content: { saleTitle: "", saleDescription: "", locationDescription: "" },
 });

 // Fetch Existing Data
 useEffect(() => {
 async function fetchProperty() {
 if (propertyId === "new") {
 setLoading(false);
 return;
 }
 try {
 const docRef = doc(db, "properties", propertyId);
 const docSnap = await getDoc(docRef);
 if (docSnap.exists()) {
 // Merge existing data with our base schema to prevent undefined errors
 setFormData((prev) => ({ ...prev, ...docSnap.data() }));
 }
 } catch (error) {
 console.error("Error fetching property:", error);
 } finally {
 setLoading(false);
 }
 }
 fetchProperty();
 }, [propertyId]);

 // Handle Input Changes seamlessly across nested objects
 const handleChange = (category: string, field: string, value: any) => {
 setFormData((prev: any) => {
 if (!category) return { ...prev, [field]: value };
 return {
 ...prev,
 [category]: {
 ...prev[category],
 [field]: value,
 },
 };
 });
 };

 // Save to Firestore
 const handleSave = async () => {
 setSaving(true);
 try {
 const docRef = doc(db, "properties", propertyId);
 // Ensure numbers are properly formatted for the frontend
 const payload = {
 ...formData,
 pricing: {
 ...formData.pricing,
 salePriceDollars: Number(formData.pricing.salePriceDollars) || null,
 },
 property: {
 ...formData.property,
 buildingSizeSf: Number(formData.property.buildingSizeSf) || null,
 lotSizeAcres: Number(formData.property.lotSizeAcres) || null,
 }
 };
 
 await updateDoc(docRef, payload);
 alert("Property details updated successfully!");
 router.push("/admin/properties");
 } catch (error) {
 console.error("Error saving property:", error);
 alert("Failed to save. Check console.");
 } finally {
 setSaving(false);
 }
 };

 if (loading) return <div className="p-10 text-center text-gray-500">Loading editor...</div>;

 return (
 <div className="max-w-6xl mx-auto p-6">
 {/* Header */}
 <div className="flex justify-between items-center mb-8">
 <div>
 <h1 className="text-3xl font-bold text-gray-900">Property Editor</h1>
 <p className="text-gray-500 mt-1">Editing: {formData.title || "Untitled"}</p>
 </div>
 <div className="flex gap-4">
 <button onClick={() => router.push("/admin/properties")} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
 Cancel
 </button>
 <button 
 onClick={handleSave} 
 disabled={saving}
 className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
 >
 {saving ? "Saving..." : "Save Changes"}
 </button>
 </div>
 </div>

 {/* Tab Navigation */}
 <div className="flex border-b border-gray-200 mb-8 gap-6">
 {["overview", "location", "details", "pricing", "content"].map((tab) => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`pb-3 font-medium capitalize transition-colors ${
 activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-900"
 }`}
 >
 {tab}
 </button>
 ))}
 </div>

 {/* Form Content - Tabbed Sections */}
 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
 
 {/* OVERVIEW TAB */}
 {activeTab === "overview" && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="col-span-full">
 <label className="block text-sm font-bold text-gray-700 mb-2">Property Title (Internal & Display)</label>
 <input 
 type="text" 
 value={formData.title} 
 onChange={(e) => handleChange("", "title", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
 />
 </div>
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Transaction Type</label>
 <select 
 value={formData.visibility.transactionLabel}
 onChange={(e) => handleChange("visibility", "transactionLabel", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
 >
 <option value="For Sale">For Sale</option>
 <option value="For Lease">For Lease</option>
 <option value="For Sale/Lease">For Sale/Lease</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Property Category</label>
 <select 
 value={formData.property.category}
 onChange={(e) => handleChange("property", "category", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
 >
 <option value="Retail">Retail</option>
 <option value="Office">Office</option>
 <option value="Industrial">Industrial</option>
 <option value="Land">Land</option>
 <option value="Specialty">Specialty</option>
 </select>
 </div>
 </div>
 )}

 {/* DETAILS TAB */}
 {activeTab === "details" && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Building Size (SF)</label>
 <input 
 type="number" 
 value={formData.property.buildingSizeSf} 
 onChange={(e) => handleChange("property", "buildingSizeSf", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
 />
 </div>
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Lot Size (Acres)</label>
 <input 
 type="number" 
 step="0.01"
 value={formData.property.lotSizeAcres} 
 onChange={(e) => handleChange("property", "lotSizeAcres", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
 />
 </div>
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Year Built</label>
 <input 
 type="number" 
 value={formData.property.yearBuilt} 
 onChange={(e) => handleChange("property", "yearBuilt", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
 />
 </div>
 </div>
 )}

 {/* PRICING TAB */}
 {activeTab === "pricing" && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-2">Sale Price ($)</label>
 <input 
 type="number" 
 value={formData.pricing.salePriceDollars} 
 onChange={(e) => handleChange("pricing", "salePriceDollars", e.target.value)}
 className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
 />
 </div>
 <div className="flex items-center mt-8">
 <input 
 type="checkbox" 
 id="hidePrice"
 checked={formData.pricing.hideSalePrice}
 onChange={(e) => handleChange("pricing", "hideSalePrice", e.target.checked)}
 className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
 />
 <label htmlFor="hidePrice" className="ml-3 text-sm font-medium text-gray-700">
 Hide Price (Displays "Call for Price" publicly)
 </label>
 </div>
 </div>
 )}

 {/* LOCATION & CONTENT TABS (Mac can flesh these out based on the pattern) */}
 {(activeTab === "location" || activeTab === "content") && (
 <div className="py-10 text-center text-gray-500 border-2 border-dashed rounded-lg">
 {activeTab} fields scaffolded. Mac to auto-populate remaining Buildout fields here.
 </div>
 )}

 </div>
 </div>
 );
}
