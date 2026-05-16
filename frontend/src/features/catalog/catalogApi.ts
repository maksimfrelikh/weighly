import { backendApi } from '../../shared/api/backendApi';

export type CategoryStatus = 'active' | 'inactive' | 'archived';

export type CatalogSummary = {
  id: string;
  storeId: string;
  name: string;
  status: string;
};

export type CatalogCategory = {
  id: string;
  catalogId: string;
  parentId: string | null;
  name: string;
  shortName: string;
  sortOrder: number;
  status: CategoryStatus;
  canAcceptActivePlacements: boolean;
  createdAt: string;
  updatedAt: string;
  children: CatalogCategory[];
};

export type CategoryTreeResponse = {
  catalog: CatalogSummary;
  categories: CatalogCategory[];
};

export type PlacementStatus = 'active' | 'inactive' | 'archived';

export type CatalogPlacementProduct = {
  id: string;
  defaultPluCode: string;
  name: string;
  shortName: string;
  status: string;
};

export type CatalogPlacementCategory = {
  id: string;
  name: string;
  shortName: string;
  status: CategoryStatus;
};

export type CatalogProductPlacement = {
  id: string;
  catalogId: string;
  categoryId: string;
  productId: string;
  sortOrder: number;
  status: PlacementStatus;
  category?: CatalogPlacementCategory;
  product?: CatalogPlacementProduct;
  createdAt: string;
  updatedAt: string;
};

export type PlacementWriteBody = {
  categoryId: string;
  productId: string;
  sortOrder?: number;
  status?: PlacementStatus;
};

type ListPlacementsQuery = {
  storeId: string;
  categoryId?: string;
  status?: PlacementStatus;
};

type PlacementWriteRequest = PlacementWriteBody & {
  storeId: string;
  csrfToken: string;
  csrfHeaderName: string;
};

type MovePlacementRequest = {
  storeId: string;
  placementId: string;
  categoryId: string;
  sortOrder?: number;
  csrfToken: string;
  csrfHeaderName: string;
};

type ReorderPlacementsRequest = {
  storeId: string;
  categoryId: string;
  placementIds: string[];
  csrfToken: string;
  csrfHeaderName: string;
};

export type CategoryWriteBody = {
  name?: string;
  shortName?: string;
  parentId?: string | null;
  sortOrder?: number;
  status?: CategoryStatus;
};

type CategoryWriteRequest = CategoryWriteBody & {
  storeId: string;
  csrfToken: string;
  csrfHeaderName: string;
};

type UpdateCategoryRequest = CategoryWriteRequest & {
  categoryId: string;
};

type ReorderCategoriesRequest = {
  storeId: string;
  parentId: string | null;
  categoryIds: string[];
  csrfToken: string;
  csrfHeaderName: string;
};

export const catalogApi = backendApi.injectEndpoints({
  endpoints: (builder) => ({

    listCatalogPlacements: builder.query<{ catalog: CatalogSummary; placements: CatalogProductPlacement[] }, ListPlacementsQuery>({
      query: ({ storeId, categoryId, status }) => ({
        url: `/stores/${storeId}/catalog/placements`,
        params: {
          ...(categoryId ? { categoryId } : {}),
          ...(status ? { status } : {}),
        },
      }),
      providesTags: (_result, _error, { storeId, categoryId }) => [
        { type: 'CatalogPlacements', id: `${storeId}:${categoryId ?? 'ALL'}` },
        { type: 'CatalogPlacements', id: storeId },
      ],
    }),
    createCatalogPlacement: builder.mutation<{ placement: CatalogProductPlacement }, PlacementWriteRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}/catalog/placements`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId, categoryId }) => [
        { type: 'CatalogPlacements', id: `${storeId}:${categoryId}` },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
    reorderCatalogPlacements: builder.mutation<{ placements: CatalogProductPlacement[] }, ReorderPlacementsRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, categoryId, placementIds }) => ({
        url: `/stores/${storeId}/catalog/placements/reorder`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body: { categoryId, placementIds },
      }),
      invalidatesTags: (_result, _error, { storeId, categoryId }) => [
        { type: 'CatalogPlacements', id: `${storeId}:${categoryId}` },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
    moveCatalogPlacement: builder.mutation<{ placement: CatalogProductPlacement }, MovePlacementRequest>({
      query: ({ storeId, placementId, csrfToken, csrfHeaderName, categoryId, sortOrder }) => ({
        url: `/stores/${storeId}/catalog/placements/${placementId}/move`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body: { categoryId, sortOrder },
      }),
      invalidatesTags: (_result, _error, { storeId, categoryId }) => [
        { type: 'CatalogPlacements', id: `${storeId}:${categoryId}` },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
    listCatalogCategories: builder.query<CategoryTreeResponse, string>({
      query: (storeId) => `/stores/${storeId}/catalog/categories`,
      providesTags: (_result, _error, storeId) => [{ type: 'CatalogCategories', id: storeId }],
    }),
    createCatalogCategory: builder.mutation<{ category: CatalogCategory }, CategoryWriteRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}/catalog/categories`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: 'CatalogCategories', id: storeId },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
    updateCatalogCategory: builder.mutation<{ category: CatalogCategory }, UpdateCategoryRequest>({
      query: ({ storeId, categoryId, csrfToken, csrfHeaderName, ...body }) => ({
        url: `/stores/${storeId}/catalog/categories/${categoryId}`,
        method: 'PATCH',
        headers: { [csrfHeaderName]: csrfToken },
        body,
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: 'CatalogCategories', id: storeId },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
    reorderCatalogCategories: builder.mutation<{ categories: CatalogCategory[] }, ReorderCategoriesRequest>({
      query: ({ storeId, csrfToken, csrfHeaderName, parentId, categoryIds }) => ({
        url: `/stores/${storeId}/catalog/categories/reorder`,
        method: 'POST',
        headers: { [csrfHeaderName]: csrfToken },
        body: { parentId, categoryIds },
      }),
      invalidatesTags: (_result, _error, { storeId }) => [
        { type: 'CatalogCategories', id: storeId },
        { type: 'CatalogPlacements', id: storeId },
        { type: 'Prices', id: storeId },
        { type: 'Publishing', id: storeId },
      ],
    }),
  }),
});

export const {
  useListCatalogCategoriesQuery,
  useListCatalogPlacementsQuery,
  useCreateCatalogPlacementMutation,
  useReorderCatalogPlacementsMutation,
  useMoveCatalogPlacementMutation,
  useCreateCatalogCategoryMutation,
  useUpdateCatalogCategoryMutation,
  useReorderCatalogCategoriesMutation,
} = catalogApi;
