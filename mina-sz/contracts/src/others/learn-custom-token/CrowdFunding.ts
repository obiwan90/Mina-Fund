import { SmartContract, state, State, method, PublicKey, UInt64, UInt32, DeployArgs, AccountUpdate } from 'o1js';
import { CrowdFundingToken } from './CrowdFundingToken.js';

export class CrowdFunding extends SmartContract {
    @state(UInt64) hardCap = State<UInt64>();
    @state(UInt32) endTime = State<UInt32>();
    @state(UInt64) tokenPrice = State<UInt64>();
    @state(PublicKey) tokenAddress = State<PublicKey>();
    @state(UInt64) totalRaised = State<UInt64>();

    async deploy(args: DeployArgs & {
        hardCap: UInt64,
        endTime: UInt32,
        tokenPrice: UInt64,
        tokenAddress: PublicKey
    }) {
        await super.deploy(args);

        this.hardCap.set(args.hardCap);
        this.endTime.set(args.endTime);
        this.tokenPrice.set(args.tokenPrice);
        this.tokenAddress.set(args.tokenAddress);
        this.totalRaised.set(UInt64.zero);
    }

    @method
    async contribute(amount: UInt64) {
        // 检查时间窗口
        const currentTime = this.network.blockchainLength.get();
        const endTime = this.endTime.get();
        endTime.assertGreaterThan(currentTime);

        // ��查硬顶
        const totalRaised = this.totalRaised.get();
        const hardCap = this.hardCap.get();
        const newTotal = totalRaised.add(amount);
        newTotal.assertLessThanOrEqual(hardCap);

        // 计算代币数量
        const tokenPrice = this.tokenPrice.get();
        const tokenAmount = amount.div(tokenPrice);

        // 接收 MINA
        const senderUpdate = AccountUpdate.createSigned(this.sender.getAndRequireSignature());
        senderUpdate.send({ to: this.address, amount });

        // 发送代币
        const receiverAcctUpt = this.send({ to: this.sender.getAndRequireSignature(), amount: tokenAmount });
        receiverAcctUpt.body.mayUseToken = AccountUpdate.MayUseToken.InheritFromParent;

        // 更新总筹集金额
        this.totalRaised.set(newTotal);
    }
} 