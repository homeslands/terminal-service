// To implement
// In controller, use decorator @Feature()
// Example: @Feature(`${FeatureSystemGroups.GROUP_EXAMPLE}:${FeatureFlagSystems[FeatureSystemGroups.GROUP_EXAMPLE].FEATURE_EXAMPLE}`)
export enum FeatureSystemGroups {
  GROUP_EXAMPLE = 'GROUP_EXAMPLE',
  ORDER = 'ORDER',
  PRINTER = 'PRINTER',
}

// if don't have children, don't put children in the object
// example:
// {
//   [FeatureSystemGroups.GROUP_EXAMPLE]: {
//     FEATURE_EXAMPLE: {
//       key: 'FEATURE_EXAMPLE',
//       description: 'Feature Example',
//     },
//   },
// }
export const FeatureFlagSystems = {
  [FeatureSystemGroups.GROUP_EXAMPLE]: {
    FEATURE_EXAMPLE: {
      key: 'FEATURE_EXAMPLE',
      description: 'Feature Example',
      children: {
        CHILD_FEATURE_EXAMPLE: {
          key: 'CHILD_FEATURE_EXAMPLE',
          description: 'Child Feature Example',
        },
      },
    },
  },
  [FeatureSystemGroups.ORDER]: {
    // user logged in: in
    CREATE_PRIVATE: {
      key: 'CREATE_PRIVATE',
      description:
        'Create, update order for user logged in. About type, include all types (at table, take out, delivery). About permission, include: logged customer buy for themselves, staff buy for customer do not account',
      children: {
        AT_TABLE: {
          key: 'AT_TABLE',
          description:
            'Create, update order for user logged in for at table type',
        },
        TAKE_OUT: {
          key: 'TAKE_OUT',
          description:
            'Create, update order for user logged in for take out type',
        },
        DELIVERY: {
          key: 'DELIVERY',
          description:
            'Create, update order for user logged in for delivery type',
        },
      },
    },
    // user not logged in
    CREATE_PUBLIC: {
      key: 'CREATE_PUBLIC',
      description:
        'Create, update order for user not logged in. About type, include all types (at table, take out). About permission, include: public user buy for themselves',
      children: {
        AT_TABLE: {
          key: 'AT_TABLE',
          description:
            'Create, update order for user not logged in for at table type',
        },
        TAKE_OUT: {
          key: 'TAKE_OUT',
          description:
            'Create, update order for user not logged in for take out type',
        },
      },
    },
  },
  [FeatureSystemGroups.PRINTER]: {
    EVENT_FAILED_PRINTING: {
      key: 'EVENT_FAILED_PRINTING',
      description: 'Trigger event when printer failed printing',
      children: {
        PRINT_INVOICE: {
          key: 'PRINT_INVOICE',
          description: 'Trigger event when invoice failed printing',
        },
        PRINT_CHEF_ORDER: {
          key: 'PRINT_CHEF_ORDER',
          description: 'Trigger event when chef order failed printing',
        },
        PRINT_LABEL_TICKET: {
          key: 'PRINT_LABEL_TICKET',
          description: 'Trigger event when label ticket failed printing',
        },
      },
    },
    PRINT_INVOICE: {
      key: 'PRINT_INVOICE',
      description: 'Enable/disable invoice printing by order type',
      children: {
        AT_TABLE: {
          key: 'AT_TABLE',
          description: 'Enable/disable invoice printing for at table orders',
        },
        TAKE_OUT: {
          key: 'TAKE_OUT',
          description: 'Enable/disable invoice printing for take out orders',
        },
        DELIVERY: {
          key: 'DELIVERY',
          description: 'Enable/disable invoice printing for delivery orders',
        },
      },
    },
    PRINT_CHEF_ORDER: {
      key: 'PRINT_CHEF_ORDER',
      description: 'Enable/disable chef order printing by order type',
      children: {
        AT_TABLE: {
          key: 'AT_TABLE',
          description: 'Enable/disable chef order printing for at table orders',
        },
        TAKE_OUT: {
          key: 'TAKE_OUT',
          description: 'Enable/disable chef order printing for take out orders',
        },
        DELIVERY: {
          key: 'DELIVERY',
          description: 'Enable/disable chef order printing for delivery orders',
        },
      },
    },
    PRINT_LABEL_TICKET: {
      key: 'PRINT_LABEL_TICKET',
      description: 'Enable/disable label ticket printing by order type',
      children: {
        AT_TABLE: {
          key: 'AT_TABLE',
          description:
            'Enable/disable label ticket printing for at table orders',
        },
        TAKE_OUT: {
          key: 'TAKE_OUT',
          description:
            'Enable/disable label ticket printing for take out orders',
        },
        DELIVERY: {
          key: 'DELIVERY',
          description:
            'Enable/disable label ticket printing for delivery orders',
        },
      },
    },
  },
} as const;
