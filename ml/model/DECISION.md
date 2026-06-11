# Decision: no ML prediction tool shipped

The preregistered bar was: 5 fold CV ROC AUC >= 0.65 AND permutation p < 0.05.

Measured: AUC = 0.465, permutation p = 0.68 (n = 370 completed
orders, 66 late). At this sample size the apparent structure (for example carrier
delay differences) is not separable from chance with enough confidence to put a probability in
front of an operations user. A confident but wrong risk score is worse than none.

What would change this: roughly 10x more orders, or a target with stronger drivers such as
route level transit times.
