export type Dash = {
  totals: {
    pending: number;
    inspecting: number;
    completed: number;
    shipped: number;
    /** 物流件數（含自送） */
    logisticsPackages: number;
    /** 自送件數（自取 + 倉庫親送） */
    selfDeliveryPackages: number;
    returnPieces: number;
  };
  totalsByFlow: {
    OUT: { pending: number; inspecting: number; completed: number; shipped: number };
    IN: { pending: number; inspecting: number; completed: number; stocked: number };
  };
  byDepartment: Array<{
    id: string;
    name: string;
    pending: number;
    inspecting: number;
    completed: number;
    shipped: number;
    shippedPackages: number;
  }>;
  byDepartmentByFlow: {
    OUT: Array<{
      id: string;
      name: string;
      pending: number;
      inspecting: number;
      completed: number;
      shipped: number;
      shippedPackages: number;
    }>;
    IN: Array<{
      id: string;
      name: string;
      pending: number;
      inspecting: number;
      completed: number;
      stocked: number;
    }>;
  };
  selfDeliveryByDepartment: Array<{
    departmentId: string;
    name: string;
    packages: number;
  }>;
  logisticsByDeptPackageSize: {
    rows: Array<{ key: "A" | "C"; label: string }>;
    byDepartment: Array<{
      departmentId: string;
      name: string;
      A: number;
      C: number;
      other: number;
    }>;
  };
  logisticsByDeptPackageSizeByFlow: {
    OUT: {
      byDepartment: Array<{
        departmentId: string;
        name: string;
        A: number;
        C: number;
        other: number;
      }>;
    };
    IN: {
      byDepartment: Array<{
        departmentId: string;
        name: string;
        A: number;
        C: number;
        other: number;
      }>;
    };
  };
  shippedByUser: Array<{
    userId: string;
    username: string;
    name: string;
    total: number;
    byDepartment: Array<{
      departmentId: string;
      name: string;
      count: number;
    }>;
  }>;
  completedByRole: Array<{
    roleType: "撿貨者" | "檢驗者" | "入庫者";
    userId: string;
    name: string;
    departmentId: string;
    departmentName: string;
    count: number;
  }>;
  shippedQtyByBrand: Array<{
    brand: string;
    total: number;
    byDepartment: Array<{
      departmentId: string;
      name: string;
      quantity: number;
    }>;
  }>;
  completedQtyByBrandByFlow: {
    OUT: Array<{
      brand: string;
      total: number;
      byDepartment: Array<{
        departmentId: string;
        name: string;
        quantity: number;
      }>;
    }>;
    IN: Array<{
      brand: string;
      total: number;
      byDepartment: Array<{
        departmentId: string;
        name: string;
        quantity: number;
      }>;
    }>;
  };
};
