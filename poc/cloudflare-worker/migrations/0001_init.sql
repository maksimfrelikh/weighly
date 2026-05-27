-- CreateTable
CREATE TABLE "PocUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordHashParams" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PocStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PocCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    CONSTRAINT "PocCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "PocStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PocCategory_storeId_parentId_fkey" FOREIGN KEY ("storeId", "parentId") REFERENCES "PocCategory" ("storeId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateIndex
CREATE UNIQUE INDEX "PocUser_email_key" ON "PocUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PocStore_code_key" ON "PocStore"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PocCategory_storeId_id_key" ON "PocCategory"("storeId", "id");
