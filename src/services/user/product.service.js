import mongoose from "mongoose";
import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";
import * as offerHelper from "../../utils/offerHelper.js";
import { PRODUCTS_PER_PAGE } from "../../config/productConstants.js";
import { PRICING_RULES } from "../../config/pricingRules.js";

/**
 * Fetch products for the main shop with filtering, sorting, and pagination
 * All logic for visibility (active categories/subs) is centralized here.
 * @param {Object} query - req.query from the controller
 * @returns {Promise<Object>} - products, total stats, and filters
 */
export const getStorefrontProducts = async (queryParams) => {
  const {
    category: categoryName,
    sub: subId,
    size,
    minPrice,
    maxPrice,
    sort = "newest",
    page = "1",
    search = "",
  } = queryParams;

  /* ── 1. Resolve category ── */
  let currentCategory = null;
  if (categoryName) {
    currentCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
      isActive: true,
    }).lean();
  }

  /* ── 2. Collect visibility constraints ── */
  const activeSubIds = await Subcategory.find({ isActive: true }).distinct("_id");
  const activeCatIds = await Category.find({ isActive: true }).distinct("_id");

  /* ── 3. Build sidebar subcategories ── */
  let sidebarSubcategories = [];
  if (currentCategory) {
    sidebarSubcategories = await Subcategory.find({
      parentCategory: currentCategory._id,
      isActive: true,
    }).select("name").lean();
  }

  /* ── 4. Build product filter ── */
  const filter = {
    isActive: true,
    isDeleted: false,
    category: { $in: activeCatIds },
    $or: [
      { subcategory: { $exists: false } },
      { subcategory: null },
      { subcategory: { $in: activeSubIds } },
    ],
  };

  if (currentCategory) filter.category = currentCategory._id;

  const subIdArr = (Array.isArray(subId) ? subId : [subId]).filter(id => id && id.trim() !== "");
  if (subIdArr.length > 0) {
    filter.subcategory = { $in: subIdArr.map(id => new mongoose.Types.ObjectId(id)) };
    delete filter.$or;
  }

  // Size filter: match ONLY variants where that size exists AND has stock > 0
  const sizeArr = (Array.isArray(size) ? size : [size]).filter(s => s && s.trim() !== "");
  if (sizeArr.length > 0) {
    filter.variants = { $elemMatch: { size: { $in: sizeArr }, stock: { $gt: 0 } } };
  }

  let filterMinPrice = null;
  let filterMaxPrice = null;
  if (minPrice || maxPrice) {
    const getVal = (v) => Array.isArray(v) ? v[0] : v;
    const min = getVal(minPrice);
    const max = getVal(maxPrice);
    if (min && !isNaN(min)) filterMinPrice = Number(min);
    if (max && !isNaN(max)) filterMaxPrice = Number(max);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    // Escape regex special characters to prevent injection / syntax errors
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchTerms = trimmedSearch
      .split(/\s+/)
      .filter(Boolean)
      .map(term => new RegExp(escapeRegex(term), 'i'));

    const catDocs = await Category.find({ name: { $in: searchTerms } }, '_id').lean();
    const subDocs = await Subcategory.find({ name: { $in: searchTerms } }, '_id').lean();
    const searchCatIds = catDocs.map(c => c._id);
    const searchSubIds = subDocs.map(s => s._id);

    filter.$and = filter.$and || [];
    searchTerms.forEach(regex => {
      filter.$and.push({
        $or: [
          { name: regex },
          { brand: regex },
          { category: { $in: searchCatIds } },
          { subcategory: { $in: searchSubIds } }
        ]
      });
    });
  }

  /* ── 5. AGGREGATION PIPELINE ── */
  const pipeline = [];

  // Match base criteria
  pipeline.push({ $match: filter });

  // Lookup offers
  pipeline.push({
    $lookup: {
      from: 'offers',
      let: { productId: "$_id", categoryId: "$category" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$isActive", true] },
                { $eq: ["$isDeleted", false] },
                { $lte: ["$startDate", new Date()] },
                { $gt: ["$expiryDate", new Date()] },
                {
                  $or: [
                    { $and: [ { $eq: ["$offerType", "product"] }, { $eq: ["$applicableTo", "$$productId"] } ] },
                    { $and: [ { $eq: ["$offerType", "category"] }, { $eq: ["$applicableTo", "$$categoryId"] } ] }
                  ]
                }
              ]
            }
          }
        }
      ],
      as: 'activeOffers'
    }
  });

  // Compute Base Price
  pipeline.push({
    $addFields: {
      basePrice: { $min: "$variants.price" }
    }
  });

  // Calculate discounts per offer
  pipeline.push({
    $addFields: {
      offerDiscounts: {
        $map: {
          input: "$activeOffers",
          as: "offer",
          in: {
            offerData: "$$offer",
            discountAmt: {
              $cond: {
                if: { $eq: ["$$offer.discountType", "flat"] },
                then: "$$offer.discountValue",
                else: {
                  $let: {
                    vars: {
                      pctDiscount: { $divide: [ { $multiply: ["$basePrice", { $min: ["$$offer.discountValue", PRICING_RULES.MAX_PERCENTAGE_DISCOUNT] }] }, 100 ] }
                    },
                    in: {
                      $cond: {
                        if: { $and: [ { $ne: ["$$offer.maximumDiscountAmount", null] }, { $gt: ["$$pctDiscount", "$$offer.maximumDiscountAmount"] } ] },
                        then: "$$offer.maximumDiscountAmount",
                        else: "$$pctDiscount"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  // Find best offer and clamp to MINIMUM_ITEM_PRICE
  pipeline.push({
    $addFields: {
      bestOfferResult: {
        $reduce: {
          input: "$offerDiscounts",
          initialValue: { discountAmt: 0, offerData: null },
          in: {
            $cond: {
              if: { $gt: ["$$this.discountAmt", "$$value.discountAmt"] },
              then: "$$this",
              else: "$$value"
            }
          }
        }
      }
    }
  });

  pipeline.push({
    $addFields: {
      computedDiscount: {
        $min: [
          "$bestOfferResult.discountAmt",
          { $max: [0, { $subtract: ["$basePrice", PRICING_RULES.MINIMUM_ITEM_PRICE] }] }
        ]
      }
    }
  });

  pipeline.push({
    $addFields: {
      finalPrice: {
        $max: [ { $subtract: ["$basePrice", "$computedDiscount"] }, PRICING_RULES.MINIMUM_ITEM_PRICE ]
      }
    }
  });

  // Extract default image (bypassing Mongoose virtuals)
  pipeline.push({
    $addFields: {
      defaultImage: {
        $let: {
          vars: {
            defaultColor: {
              $let: {
                vars: {
                  foundDefault: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ["$colorOptions", []] },
                          as: "c",
                          cond: { $eq: ["$$c.isDefault", true] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: {
                  $cond: {
                    if: { $ne: ["$$foundDefault", null] },
                    then: "$$foundDefault",
                    else: { $arrayElemAt: [{ $ifNull: ["$colorOptions", []] }, 0] }
                  }
                }
              }
            }
          },
          in: {
            $ifNull: [
              { $arrayElemAt: ["$$defaultColor.images", 0] },
              "https://placehold.co/600x700?text=No+Image"
            ]
          }
        }
      }
    }
  });

  // Memory Filter Equivalent in DB
  const priceMatch = {};
  if (filterMinPrice !== null) priceMatch.$gte = filterMinPrice;
  if (filterMaxPrice !== null) priceMatch.$lte = filterMaxPrice;
  if (Object.keys(priceMatch).length > 0) {
    pipeline.push({ $match: { finalPrice: priceMatch } });
  }

  // Sort
  let sortObj = { createdAt: -1 };
  if (sort === "price_asc") sortObj = { finalPrice: 1 };
  else if (sort === "price_desc") sortObj = { finalPrice: -1 };
  else if (sort === "name_asc") sortObj = { name: 1 };
  else if (sort === "name_desc") sortObj = { name: -1 };
  pipeline.push({ $sort: sortObj });

  // Pagination logic
  const currentPage = Math.max(1, parseInt(page) || 1);
  const skip = (currentPage - 1) * PRODUCTS_PER_PAGE;

  pipeline.push({
    $facet: {
      metadata: [ { $count: "total" } ],
      data: [
        { $skip: skip },
        { $limit: PRODUCTS_PER_PAGE }
      ]
    }
  });

  const aggregationResult = await Product.aggregate(pipeline);
  const result = aggregationResult[0];
  const totalProducts = result.metadata[0] ? result.metadata[0].total : 0;
  const rawProducts = result.data;
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE) || 1;

  // Transform bestOffer back for the frontend EJS models
  const mappedProducts = rawProducts.map(p => {
    if (p.bestOfferResult && p.bestOfferResult.offerData) {
      p.bestOffer = {
        offerId: p.bestOfferResult.offerData._id,
        offerName: p.bestOfferResult.offerData.name,
        offerType: p.bestOfferResult.offerData.offerType,
        discountType: p.bestOfferResult.offerData.discountType,
        discountValue: p.bestOfferResult.offerData.discountValue,
        discountAmount: p.computedDiscount,
        originalPrice: p.basePrice,
        finalPrice: p.finalPrice
      };
    }
    // EJS requires the mongoose 'toObject' style, so ensure we have properties
    p.id = p._id.toString();
    return p;
  });

  // Populate references
  let products = await Product.populate(mappedProducts, [
    { path: 'category', select: 'name isActive' },
    { path: 'subcategory', select: 'name isActive' }
  ]);

  // Handle out of bounds pages by recursion or just returning empty
  const safePage = Math.min(currentPage, totalPages);

  return {
    products,
    totalProducts,
    totalPages,
    currentPage: safePage,
    currentCategory,
    sidebarSubcategories,
    filterData: {
      selectedSizes: sizeArr,
      selectedSubIds: subIdArr.map(id => String(id)),
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      sortBy: sort,
      searchQuery: trimmedSearch
    }
  };
};

/**
 * Fetch a single product by ID
 */
export const getProductById = async (id) => {
  const doc = await Product.findOne({ _id: id, isDeleted: false, isActive: true })
    .populate('category', 'name')
    .populate('subcategory', 'name');
  return doc ? doc.toObject() : null;
};

/**
 * Fetch related products from the same category
 */
export const getRelatedProducts = async (categoryId, excludeId, limit = 4) => {
  const docs = await Product.find({
    category: categoryId,
    _id: { $ne: excludeId },
    isActive: true,
    isDeleted: false
  })
    .populate('category', 'name')
    .limit(limit);
  return docs.map(d => d.toObject());
};

export const getHomeData = async () => {
    const categories = await Category.find({ isActive: true }).lean();
    
    // Latest Products (limit 12)
    const docs = await Product.find({
      isActive: true,
      isDeleted: false
    })
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(12);

    const latestProducts = docs.map(d => d.toObject());

    return { categories, latestProducts };
};
