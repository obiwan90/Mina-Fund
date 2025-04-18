import {
    Field,
    State,
    PublicKey,
    SmartContract,
    state,
    method,
    UInt64,
    Permissions,
    DeployArgs,
    AccountUpdate,
    Bool,
    UInt32,
    Struct,
    Provable
} from 'o1js';

// 定义事件结构
export class ContributionEvent extends Struct({
    from: PublicKey,
    contributed: UInt64,
    refunded: UInt64
}) { }

export class WithdrawalEvent extends Struct({
    amount: UInt64
}) { }

// 状态接口
interface BaseState {
    beneficiary: State<PublicKey>;
    hardCap: State<UInt64>;
    endTime: State<UInt32>;
}

// 定义状态类型
type WindowStatus = 'open' | 'closed';
type HardCapStatus = 'reached' | 'unreached';

export class CrowdfundingContract extends SmartContract implements BaseState {
    @state(PublicKey) beneficiary = State<PublicKey>();  // 受益人地址
    @state(UInt64) hardCap = State<UInt64>();           // 硬顶
    @state(UInt32) endTime = State<UInt32>();           // 结束时间 区块高度

    events = {
        'contribution': ContributionEvent,
        'withdrawal': WithdrawalEvent
    };

    // 部署
    async deploy(args: DeployArgs & {
        beneficiary: PublicKey,
        hardCap: UInt64,
        endTime: UInt32
    }) {
        await super.deploy(args);

        // 设置合约权限
        this.account.permissions.set({
            ...Permissions.default(),
            setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
            setPermissions: Permissions.impossible(),
        })

        // 初始化状态
        this.beneficiary.set(args.beneficiary);
        this.hardCap.set(args.hardCap);
        this.endTime.set(args.endTime);
    }

    // 投资
    @method
    @validateState
    @checkHardCap('unreached', 'hard cap reached,can not contribute')
    @checkWindow('open', 'window is closed,can not contribute')
    async contribute(amount: UInt64) {
        // 验证投资金额大于0
        amount.assertGreaterThan(UInt64.from(0), 'amount must be greater than 0');
        const hardCap = this.hardCap.get();
        const currentBalance = this.account.balance.get();
        // 计算距离硬顶还剩多少额度
        const remainingToHardCap = hardCap.sub(currentBalance);

        // 计算实际可接受金额（取投资金额和剩余额度的较小值）
        const acceptedAmount = Provable.if(
            amount.lessThanOrEqual(remainingToHardCap),
            amount,
            remainingToHardCap
        );

        // 计算需要退还的金额
        const refundAmount = amount.sub(acceptedAmount);

        // 只接收实际需要的金额
        const senderUpdate = AccountUpdate.createSigned(this.sender.getAndRequireSignature());
        senderUpdate.send({ to: this.address, amount: acceptedAmount });

        // 发出投资事件
        this.emitEvent('contribution', new ContributionEvent({
            from: this.sender.getAndRequireSignature(),
            contributed: acceptedAmount,
            refunded: refundAmount
        }));
    }

    // 提现 
    @method
    @validateState
    @onlyBeneficiary('only beneficiary can withdraw')
    @checkHardCap('reached', 'hard cap not reached,can not withdraw')
    @checkWindow('closed', 'window is still open,can not withdraw')
    async withdraw() {
        // 转账给受益人
        this.send({ to: this.beneficiary.get(), amount: this.account.balance.get() });

        // 发出提款事件
        this.emitEvent('withdrawal', new WithdrawalEvent({
            amount: this.account.balance.get()
        }));
    }

}

// 验证状态
function validateState<T extends SmartContract & BaseState>(
    target: T,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<any>
) {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: T, ...args: any[]) {
        try {
            // 验证状态
            this.hardCap.getAndRequireEquals();
            this.endTime.getAndRequireEquals();
            this.account.balance.getAndRequireEquals();

            // 直接调用原始方法
            return originalMethod.apply(this, args);
        } catch (err: any) {
            throw new Error(`State validation failed in ${propertyKey}: ${err.message}`);
        }
    };

    return descriptor;
}

function onlyBeneficiary(errorMessage: string) {
    return function <T extends SmartContract & BaseState>(
        target: T,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = function (this: T, ...args: any[]) {
            // 检查调用者是否是受益人
            const sender = this.sender.getAndRequireSignature();
            const beneficiary = this.beneficiary.get();

            sender.equals(beneficiary).assertTrue(errorMessage);

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

function checkHardCap(status: HardCapStatus, errorMessage: string) {
    return function <T extends SmartContract & BaseState>(
        target: T,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = function (this: T, ...args: any[]) {
            const hardCap = this.hardCap.get();
            const currentBalance = this.account.balance.get();

            const isHardCapReached = currentBalance.greaterThanOrEqual(hardCap);
            const hardCapCondition = status === 'reached'
                ? isHardCapReached
                : isHardCapReached.not();

            hardCapCondition.assertTrue(errorMessage);

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

// 窗口检查装饰器
function checkWindow(status: WindowStatus, errorMessage: string) {
    return function <T extends SmartContract & BaseState>(
        target: T,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = function (this: T, ...args: any[]) {
            const endTime = this.endTime.get();

            // 检查时间窗口
            const currentTime = this.network.blockchainLength.get();
            const isTimeEnded = currentTime.greaterThanOrEqual(endTime);

            // 根据状态判断条件
            const windowCondition = status === 'open'
                ? isTimeEnded.not()
                : isTimeEnded;

            windowCondition.assertTrue(errorMessage);

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}
