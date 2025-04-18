import { TokenContract, UInt64, method, AccountUpdateForest, Permissions } from 'o1js';

// 代币总供应量 1亿
const SUPPLY = UInt64.from(100_000_000n * 10n ** 9n);

export class CrowdFundingToken extends TokenContract {
    @method
    async approveBase(forest: AccountUpdateForest) {
        this.checkZeroBalanceChange(forest);
    }

    async deploy() {
        await super.deploy();

        // 设置代币基本信息
        this.account.tokenSymbol.set('CFT');
        this.account.zkappUri.set('https://cdn.simpleicons.org/ethereum');  // 图标 URL

        // 设置权限，使合约不可升级
        this.account.permissions.set({
            ...Permissions.default(),
            access: Permissions.proofOrSignature(),
            setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
            setPermissions: Permissions.impossible(),
        });
    }

    @method
    async init() {
        super.init();
        // 铸造所有代币到合约地址
        this.internal.mint({
            address: this.address,
            amount: SUPPLY,
        });
    }
}