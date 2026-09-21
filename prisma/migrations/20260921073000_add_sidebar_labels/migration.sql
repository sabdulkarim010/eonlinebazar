-- CreateTable
CREATE TABLE "sidebar_labels" (
    "id" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sidebar_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sidebar_labels_menuKey_key" ON "sidebar_labels"("menuKey");
