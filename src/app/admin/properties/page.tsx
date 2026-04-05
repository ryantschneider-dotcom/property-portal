"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Direct Firebase connection ("Nuclear Option")
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export default function PropertiesDashboard() {
  const [properties, setProperties] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProperties() {
      try {
        const querySnapshot = await getDocs(collection(db, "properties"));
        const data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProperties(data);
      } catch (error) {
        console.error("Error fetching properties:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProperties();
  }, []);

  const filteredProperties = properties.filter((prop) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      prop.title?.toLowerCase().includes(searchLower) ||
      prop.address?.toLowerCase().includes(searchLower) ||
      prop.parcelId?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manage Inventory</h1>
          <p className="text-gray-500 mt-1">
            PIER Commercial internal listing control center.
          </p>
        </div>

        <div className="w-full md:w-96 flex gap-2">
          <input
            type="text"
            placeholder="Search by address, title, or parcel..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap">
            + New Listing
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 font-medium">
          Loading properties...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProperties.map((property) => (
            <div
              key={property.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="h-48 bg-gray-100 relative border-b border-gray-200">
                {property.imageUrl ? (
                  <img
                    src={property.imageUrl}
                    alt={property.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-gray-400 text-sm">
                    No Image
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded">
                  {property.transactionType || "N/A"}
                </div>
              </div>

              <div className="p-4 flex-grow flex flex-col">
                <h3 className="font-bold text-gray-900 line-clamp-2 min-h-[3rem]">
                  {property.title || "Untitled Property"}
                </h3>
                <p className="text-sm text-gray-500 mt-1 truncate">
                  {property.address || "No address listed"}
                </p>

                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="block text-gray-400 text-xs uppercase tracking-wider">
                      Zoning
                    </span>
                    <span className="font-medium text-gray-900">
                      {property.zoning || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 text-xs uppercase tracking-wider">
                      Parcel
                    </span>
                    <span className="font-medium text-gray-900">
                      {property.parcelId || "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100">
                <Link href={`/admin/properties/${property.id}/edit`}>
                  <button className="w-full bg-gray-900 text-white font-medium py-2 rounded-lg hover:bg-gray-800 transition-colors">
                    Edit Details
                  </button>
                </Link>
              </div>
            </div>
          ))}

          {filteredProperties.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              No properties found matching "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
