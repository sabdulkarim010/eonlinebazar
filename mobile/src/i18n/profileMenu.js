/** Profile menu sections — labels resolved via i18n at render time */
export function getProfileMenuSections(t) {
  return [
    {
      key: 'shopping',
      label: t('profile.shopping_utilities'),
      items: [
        {
          key: 'addresses',
          icon: 'location-outline',
          label: t('profile.saved_addresses'),
          screen: 'Addresses',
          paletteKey: 'addresses',
        },
        {
          key: 'notebook',
          icon: 'book-outline',
          label: t('profile.my_notebook'),
          screen: 'Notebook',
          paletteKey: 'notebook',
        },
        {
          key: 'referral',
          icon: 'gift-outline',
          label: t('profile.refer_earn'),
          screen: 'Referral',
          paletteKey: 'wallet',
        },
      ],
    },
    {
      key: 'account',
      label: t('profile.account_security'),
      items: [
        {
          key: 'edit-profile',
          icon: 'person-outline',
          label: t('profile.personal_info'),
          screen: 'EditProfile',
          paletteKey: 'profile',
        },
        {
          key: 'security',
          icon: 'shield-checkmark-outline',
          label: t('profile.security_settings'),
          screen: 'SecuritySettings',
          paletteKey: 'security',
        },
        {
          key: 'password',
          icon: 'lock-closed-outline',
          label: t('profile.change_password'),
          screen: 'ChangePassword',
          paletteKey: 'password',
        },
        {
          key: 'delete',
          icon: 'trash-outline',
          label: t('profile.delete_account'),
          screen: 'DeleteAccount',
          paletteKey: 'delete',
          danger: true,
        },
      ],
    },
    {
      key: 'support',
      label: t('profile.support_help'),
      items: [
        {
          key: 'live-support',
          icon: 'chatbubbles-outline',
          label: t('profile.live_support'),
          screen: 'LiveSupport',
          paletteKey: 'chat',
        },
        {
          key: 'privacy',
          icon: 'shield-outline',
          label: t('profile.privacy_policy'),
          screen: 'Legal',
          params: { slug: 'privacy-policy', titleKey: 'legal.privacy_policy' },
          paletteKey: 'privacy',
        },
        {
          key: 'terms',
          icon: 'document-text-outline',
          label: t('profile.terms_conditions'),
          screen: 'Legal',
          params: { slug: 'terms-conditions', titleKey: 'legal.terms_conditions' },
          paletteKey: 'terms',
        },
        {
          key: 'returns',
          icon: 'return-down-back-outline',
          label: t('profile.return_policy'),
          screen: 'Legal',
          params: { slug: 'return-policy', titleKey: 'legal.return_policy' },
          paletteKey: 'terms',
        },
        {
          key: 'contact',
          icon: 'call-outline',
          label: t('profile.contact_us'),
          screen: 'Legal',
          params: { slug: 'contact', titleKey: 'legal.contact_us' },
          paletteKey: 'terms',
        },
      ],
    },
  ];
}
